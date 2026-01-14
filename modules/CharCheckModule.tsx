
import React, { useState, useImperativeHandle, useRef } from 'react';
import { FileUp, AlertCircle, Download, Check, Type, Eye, ArrowRight, Search, Terminal } from 'lucide-react';
import { StoredFile, FileData } from '../types';
import { Button } from '../components/Button';
import { TableSelector } from '../components/TableSelector';
import { workspaceService } from '../services/workspaceService';
import { ToastType } from '../components/Toast';

interface Props {
  addLog: (module: string, message: string) => void;
  notify: (type: ToastType, message: string) => void;
}

interface Issue {
  table: string;
  rowId: any;
  column: string;
  char: string;
  snippet: string;
  locSuffix: string;
  fullRow: Record<string, any>;
  orderedColumns: string[];
}

export const CharCheckModule = React.forwardRef<any, Props>(({ addLog, notify }, ref) => {
  const [file, setFile] = useState<FileData | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbBufferRef = useRef<Uint8Array | null>(null);

  useImperativeHandle(ref, () => ({
    loadFile: async (f: StoredFile) => {
        if (f.content instanceof Uint8Array || typeof f.content !== 'string') {
            await processDbBuffer(f.content instanceof Uint8Array ? f.content : new Uint8Array(), f.name);
            notify('success', 'DB Loaded for Char Check');
        } else {
             addLog('ERR', 'Unsupported file format. Please load a .db file.');
             notify('error', 'Unsupported file format');
        }
    }
  }));

  const processDbBuffer = async (buffer: Uint8Array, fileName: string) => {
      try {
          addLog('CHK', `Reading SQLite file: ${fileName}...`);
          dbBufferRef.current = buffer;
          
          // @ts-ignore
          if (!window.initSqlJs) throw new Error("SQL.js not loaded in browser");
          // @ts-ignore
          const SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });

          const db = new SQL.Database(buffer);
          
          const tablesQuery = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
          if (tablesQuery.length === 0 || tablesQuery[0].values.length === 0) {
             throw new Error("No valid tables found.");
          }

          const tableNames = tablesQuery[0].values.flat() as string[];
          setTables(tableNames);
          setSelectedTables([tableNames[0]]);
          
          setFile({ name: fileName, content: "SQLite Binary", id: Math.random().toString() });
          setIssues([]);
          setHasScanned(false);
          db.close();

      } catch (e: any) {
          addLog('ERR', `DB Load Failed: ${e.message}`);
          notify('error', `DB Load Failed: ${e.message}`);
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
        try {
            const buffer = await f.arrayBuffer();
            const uint8 = new Uint8Array(buffer);
            await processDbBuffer(uint8, f.name);
            workspaceService.saveFile({
                id: Math.random().toString(36).substr(2, 9),
                name: f.name,
                type: 'source',
                content: uint8,
                mimeType: 'application/vnd.sqlite3',
                size: uint8.length,
                createdAt: new Date(),
                module: 'charcheck' 
            }).then(() => notify('info', `Saved ${f.name} to Workspace`));
        } catch (e: any) {
            addLog('ERR', `File Read Error: ${e.message}`);
        }
    }
  };

  const isTargetColumn = (colName: string) => {
      const c = colName.trim().toLowerCase();
      // Matches Text, Text1, Text2... allows Text 1 as well
      if (c === 'text' || /^text\s*\d+$/.test(c)) return true;
      // Matches Notes, Notes1...
      if (c === 'notes' || /^notes\s*\d+$/.test(c)) return true;
      // Matches specific columns
      if (['question', 'category', 'prediction', 'header', 'desc', 'description'].includes(c)) return true;
      return false;
  };

  // EXPLICIT SCAN FUNCTION
  const scanForCharacters = async (charType: 'English' | 'Hindi') => {
      if (!dbBufferRef.current || selectedTables.length === 0) return;
      
      const newIssues: Issue[] = [];
      // English: A-Z, Hindi: Unicode Block
      const regex = charType === 'Hindi' ? /[\u0900-\u097F]/ : /[a-zA-Z]/;
      
      addLog('CHK', `Starting Scan: Looking for ${charType} characters in ${selectedTables.length} tables...`);

      // @ts-ignore
      const SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });
      const db = new SQL.Database(dbBufferRef.current);

      for (const table of selectedTables) {
          const isHeaderTable = table.toLowerCase().endsWith('_header');
          // Quote table name
          const res = db.exec(`SELECT rowid, * FROM "${table}"`);
          if (res.length === 0) {
              addLog('WARN', `Table '${table}' returned no data.`);
              continue;
          }

          const columns = res[0].columns;
          addLog('CHK', `Table '${table}' has columns: [${columns.join(', ')}]`);

          // Identify columns that match our target list
          const targetCols = columns.filter((c: string) => isTargetColumn(c));

          if (targetCols.length === 0) {
              addLog('ERR', `FAIL: Table '${table}' has NO matching columns. Searched for Text, Prediction, Notes, etc.`);
              continue;
          } else {
              addLog('CHK', `Scanning '${table}' in columns: [${targetCols.join(', ')}]`);
          }
          
          let tableIssueCount = 0;
          let scannedRowCount = 0;
          let debugLogCount = 0; // Limit debug logs per table
          
          res[0].values.forEach((row: any[], rowIndex: number) => {
              const rowId = row[0]; // rowid is requested in select
              
              // SKIP LOGIC: For tables ending in _Header, skip rows 1, 2, and 3
              if (isHeaderTable && typeof rowId === 'number' && rowId <= 3) return;
              
              scannedRowCount++;

              const rowData: any = {};
              columns.forEach((c: string, i: number) => rowData[c] = row[i]);
              
              targetCols.forEach((key: string) => {
                  let val = rowData[key];
                  let wasBinaryConverted = false;

                  // BINARY FIX: If val is a byte array (Uint8Array or regular array of numbers), decode it
                  if (val && typeof val === 'object' && (val instanceof Uint8Array || Array.isArray(val))) {
                      try {
                          const bytes = val instanceof Uint8Array ? val : new Uint8Array(val);
                          val = new TextDecoder("utf-8").decode(bytes);
                          wasBinaryConverted = true;
                      } catch (e) {
                          // If decoding fails, leave it alone (it might be some other object)
                      }
                  }
                  
                  // DEBUG: Log the first 5 raw values regardless of type
                  if (debugLogCount < 5) {
                      let valStr = '';
                      if (val === null) valStr = 'NULL';
                      else if (val === undefined) valStr = 'UNDEFINED';
                      else if (typeof val === 'string') valStr = `"${val.substring(0, 30).replace(/\n/g, '\\n')}..."`;
                      else valStr = String(val);

                      addLog('DBG', `READ [Row:${rowId} Col:${key}]: Type=${typeof val}${wasBinaryConverted ? ' (Decoded from BINARY)' : ''}, Value=${valStr}`);
                  }

                  if (typeof val === 'string' && val.trim().length > 0) {
                      const lines = val.split(/\r?\n/);
                      lines.forEach((line, lineIdx) => {
                          // IGNORE SYNTAX: Remove text between < and >
                          const cleanLine = line.replace(/<[^>]*>/g, '');

                          if (debugLogCount < 5 && cleanLine.trim().length > 0) {
                             const isMatch = regex.test(cleanLine);
                             addLog('DBG', `   > Checking: "${cleanLine.substring(0, 30)}..." -> Match? ${isMatch}`);
                             debugLogCount++;
                          }

                          const match = cleanLine.match(regex);
                          if (match) {
                               const char = match[0];
                               // Use cleanLine for snippet
                               const start = Math.max(0, match.index! - 10);
                               const end = Math.min(cleanLine.length, match.index! + 25);
                               const snippet = cleanLine.substring(start, end).trim();
                               
                               const locSuffix = lines.length > 1 ? ` L${lineIdx+1}` : '';

                               newIssues.push({ 
                                   table: table,
                                   rowId: rowId,
                                   column: key,
                                   char: char,
                                   snippet: snippet,
                                   locSuffix: locSuffix,
                                   fullRow: rowData,
                                   orderedColumns: columns
                               });
                               tableIssueCount++;
                          }
                      });
                  }
              });
          });
          addLog('CHK', `> Scanned ${scannedRowCount} rows in ${table}. Found ${tableIssueCount} issues.`);
      }
      
      db.close();
      setIssues(newIssues);
      setHasScanned(true);
      addLog('CHK', `Scan complete. Found ${newIssues.length} total issues.`);
      if (newIssues.length > 0) notify('error', `Found ${newIssues.length} issues`);
      else notify('success', `No ${charType} characters found in selected columns.`);
  };

  // Group issues by table
  const groupedIssues = issues.reduce((acc, issue) => {
      if (!acc[issue.table]) acc[issue.table] = [];
      acc[issue.table].push(issue);
      return acc;
  }, {} as Record<string, typeof issues>);

  // Helper to generate context string
  const getContextString = (issue: Issue) => {
      const dataCols = issue.orderedColumns.filter(c => c.toLowerCase() !== 'rowid' && c !== '_row_id_');
      const ctxCols: string[] = [];
      
      for(const col of dataCols) {
          // Rule: Choose cols 1,2,3... Stop if we hit the affected column.
          if(ctxCols.length >= 3) break;
          if(col === issue.column) break;
          
          let val = issue.fullRow[col];
          // Handle binary in context preview too
          if (val && typeof val === 'object' && (val instanceof Uint8Array || Array.isArray(val))) {
              try { val = new TextDecoder("utf-8").decode(val instanceof Uint8Array ? val : new Uint8Array(val)); } catch (e) {}
          }
          
          let valStr = String(val ?? '');
          if (valStr.length > 20) valStr = valStr.substring(0, 20) + '...';
          ctxCols.push(`${col}(${valStr})`);
      }
      
      return ctxCols.length > 0 ? ctxCols.join(', ') : '';
  };

  const handleDownloadReport = () => {
    if (issues.length === 0) return;
    const timestamp = new Date().toLocaleString();
    let content = `Char Check Validation Report\nGenerated: ${timestamp}\nTotal Issues: ${issues.length}\n==================================================\n\n`;

    Object.keys(groupedIssues).forEach(tableName => {
        content += `TABLE: ${tableName}\n`;
        content += `==================================================\n`;
        groupedIssues[tableName].forEach(issue => {
             const ctx = getContextString(issue);
             content += `ROW ${issue.rowId} | ${ctx}\n`;
             content += `   -> Affected Column: ${issue.column}${issue.locSuffix}\n`;
             content += `   -> Error: Found '${issue.char}' in "...${issue.snippet}..."\n`;
             content += `--------------------------------------------------\n`;
        });
        content += '\n';
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Char_Check_Report_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
     <div className="flex flex-col h-full bg-white">
        <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-30 relative h-12">
           <div className="flex items-center gap-6">
              <div className="flex flex-col">
                  <h2 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Char Check</h2>
                   {file && <span className="text-[9px] text-slate-500 truncate max-w-[150px] font-medium" title={file.name}>{file.name}</span>}
              </div>
              <div className="h-6 w-px bg-slate-200"></div>
              {file && (
                 <div className="flex items-center gap-4">
                     <TableSelector 
                        tables={tables} 
                        selectedTables={selectedTables} 
                        onChange={setSelectedTables} 
                     />
                     <div className="h-5 w-px bg-slate-300 mx-1"></div>
                     <div className="flex items-center gap-2">
                        {/* 
                           LABEL FIX: 
                           "Find Hindi Chars" -> Looks for Hindi (Anomaly in English DB)
                           "Find English Chars" -> Looks for English (Anomaly in Hindi DB)
                        */}
                        <Button size="sm" variant="secondary" className="h-7 text-xs px-3" onClick={() => scanForCharacters('Hindi')} title="Scan for Hindi characters in the database">
                             <Search className="w-3.5 h-3.5 mr-1.5 text-orange-600"/> Find Hindi
                        </Button>
                        <Button size="sm" variant="secondary" className="h-7 text-xs px-3" onClick={() => scanForCharacters('English')} title="Scan for English characters in the database">
                             <Search className="w-3.5 h-3.5 mr-1.5 text-blue-600"/> Find English
                        </Button>
                     </div>
                 </div>
              )}
           </div>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50 p-6">
           {!file ? (
               <div className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full">
                   <div className="w-full">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".db,.sqlite,.sqlite3"
                        className="hidden"
                      />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="group relative border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-primary-500 hover:shadow-md rounded-xl p-12 text-center cursor-pointer transition-all duration-300"
                      >
                        <div className="flex flex-col items-center gap-5 relative z-10">
                          <div className="p-4 rounded-full bg-white text-primary-600 shadow-md group-hover:bg-primary-600 group-hover:text-white transition-transform duration-300 group-hover:scale-110">
                            <FileUp className="w-6 h-6 stroke-[2]" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Select SQLite Database</h3>
                            <p className="text-slate-500 text-[11px] font-medium tracking-wide">Supports .db, .sqlite files</p>
                          </div>
                        </div>
                      </div>
                   </div>
               </div>
           ) : hasScanned && issues.length > 0 ? (
               <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-0 min-h-0 flex flex-col h-full overflow-hidden">
                   <div className="px-6 py-4 border-b border-red-100 bg-red-50 flex justify-between items-center shrink-0">
                       <h2 className="text-sm font-bold text-red-700 flex items-center gap-2">
                           <AlertCircle className="w-5 h-5"/> Validation Issues ({issues.length})
                       </h2>
                       <div className="flex items-center gap-2">
                          <Button variant="ghost" onClick={handleDownloadReport} className="text-slate-600 hover:text-primary-600 hover:bg-white h-8 text-xs border border-transparent hover:border-slate-200">
                              <Download className="w-3.5 h-3.5 mr-1.5"/> Download Report
                          </Button>
                          <Button variant="ghost" onClick={() => { setIssues([]); setHasScanned(false); }} className="text-red-600 hover:bg-red-100 h-8 text-xs">Dismiss Report</Button>
                       </div>
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                       {Object.keys(groupedIssues).map(tableName => (
                           <div key={tableName}>
                               <div className="flex items-center gap-2 font-bold text-slate-800 text-xs uppercase tracking-wider border-b border-slate-200 pb-2 mb-3 bg-slate-50 px-2 py-2 rounded-t">
                                   <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                   TABLE: {tableName}
                                </div>
                               <div className="space-y-3 pl-2">
                                   {groupedIssues[tableName].map((issue, i) => {
                                       const contextStr = getContextString(issue);
                                       return (
                                       <div key={i} className="flex flex-col bg-white border border-slate-100 rounded-lg p-3 hover:border-red-100 hover:shadow-sm transition-all">
                                           {/* Context Header */}
                                           <div className="flex items-center gap-2 text-xs font-mono mb-2 border-b border-slate-50 pb-2">
                                               <span className="font-bold text-slate-800 px-1.5 py-0.5 bg-slate-100 rounded">Row {issue.rowId}</span>
                                               <span className="text-slate-500 truncate" title={contextStr}>{contextStr}</span>
                                           </div>
                                           {/* Error Detail */}
                                           <div className="flex items-start gap-3 pl-2">
                                                <div className="mt-0.5">
                                                    <ArrowRight className="w-3.5 h-3.5 text-red-400" />
                                                </div>
                                                <div className="flex flex-col gap-1 text-[11px]">
                                                    <span className="font-bold text-slate-700">
                                                        Affected Column: <span className="text-red-600">{issue.column}</span>
                                                        {issue.locSuffix && <span className="text-slate-400 font-normal ml-1">{issue.locSuffix}</span>}
                                                    </span>
                                                    <span className="font-mono text-slate-600 bg-red-50 px-2 py-1 rounded border border-red-50 break-all">
                                                        Found '<span className="font-bold text-red-700">{issue.char}</span>' in: ...{issue.snippet}...
                                                    </span>
                                                </div>
                                           </div>
                                       </div>
                                   )})}
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
           ) : (
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    {/* Top Info */}
                    <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                                <Type className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">{file.name}</h3>
                                <p className="text-[10px] text-slate-500">SQLite Database • {((dbBufferRef.current?.length || 0) / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        </div>
                        <div className="flex gap-4 text-right">
                             {hasScanned ? (
                                <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-100">
                                    <Check className="w-4 h-4" /> <span className="text-xs font-bold">Passed</span>
                                </div>
                             ) : (
                                <>
                                    <div>
                                        <div className="text-xs font-bold text-slate-700">{tables.length}</div>
                                        <div className="text-[9px] text-slate-500 uppercase tracking-wider">Total Tables</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-primary-600">{selectedTables.length}</div>
                                        <div className="text-[9px] text-slate-500 uppercase tracking-wider">Targeted</div>
                                    </div>
                                </>
                             )}
                        </div>
                    </div>

                    <div className="flex-1 p-6 flex gap-6 overflow-hidden">
                        {/* Left: Rules Info */}
                        <div className="flex-1 flex flex-col gap-4">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <Eye className="w-4 h-4" /> Scanning Rules
                            </h4>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Find English Characters</p>
                                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                            Scans for any <strong>English characters (A-Z)</strong>. Useful for checking if a Hindi database has untranslated English text.
                                        </p>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Find Hindi Characters</p>
                                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                             Scans for any <strong>Hindi characters</strong> (Unicode \u0900-\u097F). Useful for finding if an English database has mixed Hindi text.
                                        </p>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Target Columns</p>
                                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                            Only scans: <code>Text</code>, <code>Text1-8</code>, <code>Notes</code>, <code>Question</code>, <code>Category</code>, <code>Prediction</code>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Table List */}
                        <div className="w-1/3 flex flex-col bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-200 bg-white flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Selected Tables</span>
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{selectedTables.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {selectedTables.length > 0 ? selectedTables.map(t => (
                                    <div key={t} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-slate-100 rounded shadow-sm">
                                        <div className="w-1 h-1 rounded-full bg-indigo-500"></div>
                                        <span className="text-[10px] font-medium text-slate-700 truncate" title={t}>{t}</span>
                                    </div>
                                )) : (
                                    <div className="h-full flex items-center justify-center text-[10px] text-slate-400 italic">
                                        Select tables from the toolbar
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex justify-between items-center">
                        <span className="text-[10px] text-slate-400">
                            Check the "System Output" log below if scan returns 0 results unexpectedly.
                        </span>
                        <button onClick={() => { setFile(null); setTables([]); setIssues([]); dbBufferRef.current = null; }} className="text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded transition-colors">
                            Close Database
                        </button>
                    </div>
                </div>
           )}
        </div>
     </div>
  );
});
