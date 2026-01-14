
import React, { useState, useImperativeHandle, useRef } from 'react';
import { Database, AlignLeft, AlertCircle, Save, FileUp, Table as TableIcon, Check, Download } from 'lucide-react';
import { StoredFile, FileData } from '../types';
import { AdvancedFormatter } from '../services/advancedFormatter';
import { Button } from '../components/Button';
import { TableSelector } from '../components/TableSelector';
import { workspaceService } from '../services/workspaceService';
import { identifyTargetColumns } from '../utils/parser.ts';

interface Props {
  addLog: (module: string, message: string) => void;
}

export const FormatterModule = React.forwardRef<any, Props>(({ addLog }, ref) => {
  const [file, setFile] = useState<FileData | null>(null);
  
  // Data for PREVIEW ONLY (First selected table usually)
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewTable, setPreviewTable] = useState<string>('');

  const [tables, setTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [issues, setIssues] = useState<{table: string, loc: string, msg: string}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbBufferRef = useRef<Uint8Array | null>(null);

  useImperativeHandle(ref, () => ({
    loadFile: async (f: StoredFile) => {
        if (f.content instanceof Uint8Array || typeof f.content !== 'string') {
            await processDbBuffer(f.content instanceof Uint8Array ? f.content : new Uint8Array(), f.name);
        } else {
             addLog('ERR', 'Unsupported file format. Please load a .db file.');
        }
    }
  }));

  const processDbBuffer = async (buffer: Uint8Array, fileName: string) => {
      try {
          addLog('FMT', `Reading SQLite file: ${fileName}...`);
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
          
          await loadTablePreview(db, tableNames[0]);

          setFile({ name: fileName, content: "SQLite Binary", id: Math.random().toString() });
          setIssues([]);
          db.close();

      } catch (e: any) {
          addLog('ERR', `DB Load Failed: ${e.message}`);
          alert(`Failed to load database: ${e.message}`);
      }
  };

  const loadTablePreview = async (db: any, table: string) => {
      setPreviewTable(table);
      const res = db.exec(`SELECT * FROM ${table} LIMIT 50`);
      if (res.length === 0) {
          setPreviewData([]);
      } else {
          const columns = res[0].columns;
          const values = res[0].values;
          const mapped = values.map((row: any[]) => {
              const obj: any = {};
              columns.forEach((col: string, i: number) => obj[col] = row[i]);
              return obj;
          });
          setPreviewData(mapped);
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
        try {
            const buffer = await f.arrayBuffer();
            await processDbBuffer(new Uint8Array(buffer), f.name);
        } catch (e: any) {
            addLog('ERR', `File Read Error: ${e.message}`);
        }
    }
  };

  const checkLang = async (lang: 'English' | 'Hindi') => {
      if (!dbBufferRef.current || selectedTables.length === 0) return;
      
      const newIssues: {table: string, loc: string, msg: string}[] = [];
      addLog('FMT', `Checking language (${lang}) across ${selectedTables.length} tables...`);

      // @ts-ignore
      const SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });
      const db = new SQL.Database(dbBufferRef.current);

      for (const table of selectedTables) {
          const res = db.exec(`SELECT rowid, * FROM ${table}`);
          if (res.length === 0) continue;

          const columns = res[0].columns;
          const targetColumns = identifyTargetColumns(table, columns);
          
          if (targetColumns.length === 0) continue;

          res[0].values.forEach((row: any[]) => {
              const rowData: any = {};
              columns.forEach((c: string, i: number) => rowData[c] = row[i]);
              
              targetColumns.forEach(key => {
                  const val = rowData[key];
                  if (typeof val === 'string') {
                      const indices = AdvancedFormatter.detectLanguageIssues(val, lang);
                      if (indices.length > 0) {
                          newIssues.push({ 
                              table: table,
                              loc: `Row ${rowData.rowid || '?'} [${key}]`, 
                              msg: `Found ${lang === 'English' ? 'Hindi' : 'English'} chars` 
                          });
                      }
                  }
              });
          });
      }
      
      db.close();
      setIssues(newIssues);
      addLog('FMT', `Scan complete. Found ${newIssues.length} issues.`);
  };

  const handleFixTabs = async () => {
      if (!dbBufferRef.current || selectedTables.length === 0) return;
      
      setIsProcessing(true);
      addLog('FMT', `Applying Tab Fixes to ${selectedTables.length} tables...`);

      try {
          // @ts-ignore
          const SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });
          const db = new SQL.Database(dbBufferRef.current);

          let totalFixed = 0;

          for (const table of selectedTables) {
              const res = db.exec(`SELECT rowid, * FROM ${table}`);
              if (res.length === 0) continue;
              
              const columns = res[0].columns;
              const targetColumns = identifyTargetColumns(table, columns);
              if (targetColumns.length === 0) continue;

              db.exec("BEGIN TRANSACTION;");
              let tableChanges = 0;
              try {
                  const updatesToRun: { sql: string, params: any[] }[] = [];
                  
                  res[0].values.forEach((row: any[]) => {
                      const rowId = row[0]; // rowid is requested in select
                      const rowData: any = {};
                      columns.forEach((c: string, i: number) => rowData[c] = row[i]);

                      const updates: string[] = [];
                      const params: any[] = [];

                      targetColumns.forEach(col => {
                          const val = rowData[col];
                          if (typeof val === 'string') {
                              const formatted = AdvancedFormatter.formatTabs(val);
                              if (formatted !== val) {
                                  updates.push(`${col} = ?`);
                                  params.push(formatted);
                              }
                          }
                      });

                      if (updates.length > 0) {
                          params.push(rowId);
                          updatesToRun.push({
                             sql: `UPDATE ${table} SET ${updates.join(', ')} WHERE rowid = ?`,
                             params: params
                          });
                      }
                  });
                  
                  updatesToRun.forEach(q => {
                      db.run(q.sql, q.params);
                      tableChanges++;
                  });

                  db.exec("COMMIT;");
                  if (tableChanges > 0) addLog('FMT', `Fixed ${tableChanges} rows in ${table}`);
                  totalFixed += tableChanges;

              } catch(e: any) {
                  db.exec("ROLLBACK;");
                  addLog('ERR', `Error updating ${table}: ${e.message}`);
              }
          }
          
          // Save back to buffer
          const data = db.export();
          dbBufferRef.current = data;
          
          // Refresh preview
          if (selectedTables.includes(previewTable)) {
             await loadTablePreview(db, previewTable);
          }
          db.close();
          
          addLog('FMT', `Operation Complete. Total rows updated: ${totalFixed}. Export DB to save.`);
      
      } catch (e: any) {
          addLog('ERR', `Fix Tabs Failed: ${e.message}`);
      }
      setIsProcessing(false);
  };

  const handleExportDB = () => {
      if (!dbBufferRef.current || !file) return;
      const saveName = `Formatted_${file.name}`;
      workspaceService.saveFile({
        id: Math.random().toString(),
        name: saveName,
        content: dbBufferRef.current,
        type: 'destination',
        mimeType: 'application/vnd.sqlite3',
        size: dbBufferRef.current.length,
        createdAt: new Date(),
        module: 'formatter'
      });
      addLog('FMT', `Saved ${saveName} to Workspace`);
  };

  const renderTable = () => {
      if (previewData.length === 0) return <div className="p-8 text-center text-slate-400 text-xs">Select a table to preview data</div>;
      const columns = Object.keys(previewData[0]);
      const targetColumns = identifyTargetColumns(previewTable, columns);

      return (
          <div className="overflow-auto border rounded-xl border-slate-200 shadow-sm bg-white h-full">
              <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-600 sticky top-0 shadow-sm z-10">
                      <tr>
                          {columns.slice(0,8).map(c => (
                             <th key={c} className={`p-3 border-b border-slate-200 uppercase tracking-wider text-[11px] ${targetColumns.includes(c) ? 'bg-primary-50 text-primary-700' : ''}`}>
                                 {c}
                             </th>
                          ))}
                          {columns.length > 8 && <th className="p-3 border-b border-slate-200">...</th>}
                      </tr>
                  </thead>
                  <tbody className="bg-white font-mono text-[11px] text-slate-700">
                      {previewData.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-primary-50/30 transition-colors">
                              {columns.slice(0,8).map(c => <td key={c} className="p-3 truncate max-w-[200px] border-r border-slate-50" title={JSON.stringify(r[c])}>{String(r[c])}</td>)}
                              {columns.length > 8 && <td className="p-3 text-slate-400">...</td>}
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      );
  };

  return (
     <div className="flex flex-col h-full bg-white">
        <div className="px-8 py-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-30 relative">
           <div className="flex items-center gap-6">
              <div className="flex flex-col">
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Database Formatter</h2>
                  <span className="text-[10px] text-slate-500">Validate SQLite Datasets</span>
              </div>
              <div className="h-8 w-px bg-slate-200"></div>
              {file && (
                 <div className="flex items-center gap-4">
                     <TableSelector 
                        tables={tables} 
                        selectedTables={selectedTables} 
                        onChange={setSelectedTables} 
                     />
                     <div className="h-6 w-px bg-slate-300 mx-1"></div>
                     <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={handleFixTabs} isLoading={isProcessing} disabled={isProcessing}>
                            <AlignLeft className="w-4 h-4 mr-1 text-primary-600"/> Fix Tabs
                        </Button>
                        <div className="h-4 w-px bg-slate-200 mx-1"></div>
                        <Button size="sm" variant="secondary" onClick={() => checkLang('English')}><AlertCircle className="w-4 h-4 mr-1"/> Scan Hindi</Button>
                        <Button size="sm" variant="secondary" onClick={() => checkLang('Hindi')}><AlertCircle className="w-4 h-4 mr-1"/> Scan English</Button>
                     </div>
                 </div>
              )}
           </div>
           {file && (
              <Button onClick={handleExportDB} size="sm" className="bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-sm">
                  <Save className="w-4 h-4 mr-2" /> Save DB
              </Button>
           )}
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50 p-6">
           {issues.length > 0 && (
               <div className="mb-4 h-48 shrink-0 bg-red-50 border border-red-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
                  <div className="px-4 py-2 bg-red-100/50 border-b border-red-200 flex justify-between items-center">
                      <h4 className="text-xs font-bold text-red-700 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4"/> Validation Issues ({issues.length})
                      </h4>
                      <button onClick={() => setIssues([])} className="text-[10px] text-red-600 hover:text-red-800 font-bold hover:underline">Dismiss</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-1">
                      {issues.map((err, i) => (
                          <div key={i} className="text-[11px] font-mono text-red-800 flex gap-4 border-b border-red-100 last:border-0 pb-1 last:pb-0">
                              <span className="w-24 font-bold shrink-0 text-slate-500">{err.table}</span>
                              <span className="w-32 font-bold shrink-0">{err.loc}</span>
                              <span>{err.msg}</span>
                          </div>
                      ))}
                  </div>
               </div>
           )}

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
           ) : (
               <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                   <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                       <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                           <Database className="w-4 h-4 text-blue-500" />
                           Preview: {previewTable}
                       </span>
                       <button onClick={() => { setFile(null); setPreviewData([]); setTables([]); setIssues([]); dbBufferRef.current = null; }} className="text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded font-bold transition-colors">Close File</button>
                   </div>
                   <div className="flex-1 overflow-hidden p-6 bg-slate-50">
                       {renderTable()}
                   </div>
               </div>
           )}
        </div>
     </div>
  );
});
