
import React, { useState, useImperativeHandle, useRef } from 'react';
import { AlignLeft, AlertCircle, Save, FileUp, Check, Download, Database, ArrowRight } from 'lucide-react';
import { StoredFile, FileData } from '../types';
import { AdvancedFormatter } from '../services/advancedFormatter';
import { Button } from '../components/Button';
import { TableSelector } from '../components/TableSelector';
import { workspaceService } from '../services/workspaceService';
import { identifyTargetColumns } from '../utils/parser';
import { ToastType } from '../components/Toast';

interface Props {
  addLog: (module: string, message: string) => void;
  notify: (type: ToastType, message: string) => void;
}

export const FormatterModule = React.forwardRef<any, Props>(({ addLog, notify }, ref) => {
  const [file, setFile] = useState<FileData | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  // Only tab formatting messages now, removed language scan issues if any
  const [isProcessing, setIsProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbBufferRef = useRef<Uint8Array | null>(null);

  useImperativeHandle(ref, () => ({
    loadFile: async (f: StoredFile) => {
        if (f.content instanceof Uint8Array || typeof f.content !== 'string') {
            await processDbBuffer(f.content instanceof Uint8Array ? f.content : new Uint8Array(), f.name);
            notify('success', 'DB Loaded for Formatting');
        } else {
             addLog('ERR', 'Unsupported file format. Please load a .db file.');
             notify('error', 'Unsupported file format');
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
          
          setFile({ name: fileName, content: "SQLite Binary", id: Math.random().toString() });
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
                module: 'formatter'
            }).then(() => notify('info', `Saved ${f.name} to Workspace`));
        } catch (e: any) {
            addLog('ERR', `File Read Error: ${e.message}`);
        }
    }
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
                          let val = rowData[col];
                          
                          // BINARY FIX: Decode if Uint8Array
                          if (val && typeof val === 'object' && (val instanceof Uint8Array || Array.isArray(val))) {
                              try { val = new TextDecoder("utf-8").decode(val instanceof Uint8Array ? val : new Uint8Array(val)); } catch (e) {}
                          }

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
          
          db.close();
          
          addLog('FMT', `Operation Complete. Total rows updated: ${totalFixed}. Export DB to save.`);
          
          if (totalFixed === 0) {
              notify('info', 'No Tab Issues Found');
          } else {
              notify('success', `Formatting Completed: ${totalFixed} rows fixed`);
          }
      
      } catch (e: any) {
          addLog('ERR', `Fix Tabs Failed: ${e.message}`);
          notify('error', e.message);
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
      notify('success', 'Database Saved to Workspace');
  };

  return (
     <div className="flex flex-col h-full bg-white">
        <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-30 relative h-12">
           <div className="flex items-center gap-6">
              <div className="flex flex-col">
                  <h2 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Tab Formatting</h2>
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
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleFixTabs} isLoading={isProcessing} disabled={isProcessing}>
                            <AlignLeft className="w-3.5 h-3.5 mr-1 text-primary-600"/> Fix Tabs
                        </Button>
                     </div>
                 </div>
              )}
           </div>
           {file && (
              <Button onClick={handleExportDB} size="sm" className="bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-sm h-7 text-xs">
                  <Save className="w-3.5 h-3.5 mr-2" /> Save DB
              </Button>
           )}
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
           ) : (
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    {/* Top Info */}
                    <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                                <Database className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">{file.name}</h3>
                                <p className="text-[10px] text-slate-500">SQLite Database • {((dbBufferRef.current?.length || 0) / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        </div>
                        <div className="flex gap-4 text-right">
                            <div>
                                <div className="text-xs font-bold text-slate-700">{tables.length}</div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Total Tables</div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-primary-600">{selectedTables.length}</div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Targeted</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 p-6 flex gap-6 overflow-hidden">
                        {/* Left: Rules Info */}
                        <div className="flex-1 flex flex-col gap-4">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <AlignLeft className="w-4 h-4" /> Formatting Rules
                            </h4>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Paragraph Indentation</p>
                                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                            Automatically adds a tab character (<code>\t</code>) to the beginning of any cell content that contains <strong>5 or more words</strong>.
                                        </p>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Preservation Logic</p>
                                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                            Skips indentation if the line ends with a colon (<code>:</code>) or already starts with whitespace, preserving existing lists and headers.
                                        </p>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Cleanup</p>
                                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                            Removes literal escaped characters like <code>\t</code> or <code>/t</code> that may have been typed manually.
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
                                        <div className="w-1 h-1 rounded-full bg-green-500"></div>
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
                            Click "Fix Tabs" in the toolbar to apply changes.
                        </span>
                        <button onClick={() => { setFile(null); setTables([]); dbBufferRef.current = null; }} className="text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded transition-colors">
                            Close File
                        </button>
                    </div>
                </div>
           )}
        </div>
     </div>
  );
});
