
import React, { useState, useRef, useImperativeHandle } from 'react';
import toast from 'react-hot-toast';
import { Database, FileUp, Save, Table as TableIcon, ArrowRight, Upload } from 'lucide-react';
import { TargetLanguage, StoredFile, FileData } from '../types';
import { GeminiService, DBBatchItem } from '../services/geminiService.ts';
import { workspaceService } from '../services/workspaceService';
import { Button } from '../components/Button';
import { TableSelector } from '../components/TableSelector';
import { LANGUAGES } from '../constants.ts';
import { identifyTargetColumns } from '../utils/parser.ts';

interface Props {
  customApiKey: string;
  addLog: (module: string, message: string) => void;
}

// Re-using local queue function for independence
async function processBatchQueue<T>(
  items: T[], 
  batchSize: number, 
  processFn: (batch: T[], startIndex: number, retryCount: number) => Promise<void>,
  onProgress: (processedCount: number) => void,
  checkStop: () => boolean,
  addLog: (module: string, msg: string) => void,
  delayBetweenBatches: number = 6000 
) {
  const chunks: { data: T[], index: number }[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push({ data: items.slice(i, i + batchSize), index: i });
  }

  let processedCount = 0;

  for (const chunk of chunks) {
    if (checkStop()) break;
    let retries = 0;
    let success = false;
    while (!success && retries <= 5 && !checkStop()) {
      try {
        await processFn(chunk.data, chunk.index, retries);
        success = true;
      } catch (err: any) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('429') || msg.includes('too many requests')) {
           retries++;
           const waitTime = 60000; 
           addLog('SYS', `⚠️ Rate Limit Hit on Batch ${chunk.index}. Cooling down for 60s... (Attempt ${retries}/5)`);
           await new Promise(r => setTimeout(r, waitTime));
        } else if (msg.includes('retry_batch')) {
           retries++;
           const waitTime = 5000;
           addLog('SYS', `♻️ Validation failed on Batch ${chunk.index}. Retrying in 5s...`);
           await new Promise(r => setTimeout(r, waitTime));
        } else {
           addLog('ERR', `Batch ${chunk.index} Failed: ${msg}. Skipping.`);
           break; 
        }
      }
    }
    processedCount += chunk.data.length;
    onProgress(processedCount);
    if (chunks.length > 1 && !checkStop()) {
        await new Promise(r => setTimeout(r, delayBetweenBatches));
    }
  }
}

export const DatabaseModule = React.forwardRef<any, Props>(({ customApiKey, addLog }, ref) => {
  const [file, setFile] = useState<FileData | null>(null);
  const [targetFile, setTargetFile] = useState<FileData | null>(null);
  
  const [data, setData] = useState<any[]>([]); // Data of currently PREVIEWED table
  const [previewTable, setPreviewTable] = useState<string>('');
  
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  
  const [targetLang, setTargetLang] = useState(TargetLanguage.Hindi);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [currentProcessingTable, setCurrentProcessingTable] = useState('');
  
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  
  const dbBufferRef = useRef<Uint8Array | null>(null);
  const targetDbBufferRef = useRef<Uint8Array | null>(null);

  useImperativeHandle(ref, () => ({
    loadFile: async (f: StoredFile) => {
        // Workspace DB only
        if (f.content instanceof Uint8Array || typeof f.content !== 'string') {
             await processDbBuffer(f.content instanceof Uint8Array ? f.content : new Uint8Array(), f.name);
        } else {
             addLog('ERR', 'Unsupported file format. Please load a .db file.');
        }
    }
  }));

  const processDbBuffer = async (buffer: Uint8Array, fileName: string) => {
      try {
          addLog('DB', `Reading SQLite file: ${fileName}...`);
          dbBufferRef.current = buffer;
          
          // @ts-ignore
          if (!window.initSqlJs) throw new Error("SQL.js not loaded");
          // @ts-ignore
          const SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });

          const db = new SQL.Database(buffer);
          
          const tablesQuery = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
          if (tablesQuery.length === 0 || tablesQuery[0].values.length === 0) {
             throw new Error("No valid tables found.");
          }

          const tableNames = tablesQuery[0].values.flat() as string[];
          setTables(tableNames);
          setSelectedTables([tableNames[0]]); // Select first by default
          
          // Preview first table
          await loadTableData(db, tableNames[0]);
          
          setFile({ name: fileName, content: "SQLite Binary", id: Math.random().toString() });
          db.close();

      } catch (e: any) {
          const errorMsg = `DB Load Failed: ${e.message}`;
          addLog('ERR', errorMsg);
          toast.error(errorMsg);
      }
  };

  const loadTargetDb = async (buffer: Uint8Array, fileName: string) => {
      try {
          toast.success(`Loaded Target DB: ${fileName}`);
          targetDbBufferRef.current = buffer;
          setTargetFile({ name: fileName, content: "Target DB", id: Math.random().toString() });
      } catch (e: any) {
          toast.error(`Target DB Load Failed: ${e.message}`);
      }
  };

  const loadTableData = async (db: any, table: string) => {
      setPreviewTable(table);
      const res = db.exec(`SELECT rowid as _row_id_, * FROM ${table} LIMIT 100`);
      
      if (res.length === 0) {
          setData([]);
      } else {
          const columns = res[0].columns;
          const values = res[0].values;
          const mapped = values.map((row: any[]) => {
              const obj: any = {};
              columns.forEach((col: string, i: number) => {
                  obj[col] = row[i];
              });
              return obj;
          });
          setData(mapped);
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
        try {
            const buffer = await f.arrayBuffer();
            await processDbBuffer(new Uint8Array(buffer), f.name);
        } catch (e: any) {
            toast.error(`File Read Error: ${e.message}`);
        }
    }
  };

  const handleTargetChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
        try {
            const buffer = await f.arrayBuffer();
            await loadTargetDb(new Uint8Array(buffer), f.name);
        } catch (e: any) {
            toast.error(`Target Read Error: ${e.message}`);
        }
    }
  };

  const handleProcess = async () => {
    if (selectedTables.length === 0) return;
    if (!dbBufferRef.current) return;

    stopRef.current = false;
    setStatus('processing');
    const gemini = new GeminiService(customApiKey);

    const promise = new Promise<string>(async (resolve, reject) => {
      try {
        // @ts-ignore
        const SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });
        const sourceDb = new SQL.Database(dbBufferRef.current);
        
        let writableDb: any;
        let outputFileName = '';

        if (targetFile && targetDbBufferRef.current) {
            writableDb = new SQL.Database(targetDbBufferRef.current);
            outputFileName = targetFile.name.replace('.db', `_${targetLang}.db`);
        } else {
            writableDb = new SQL.Database(dbBufferRef.current);
            outputFileName = file!.name.replace(/(\.db|\.sqlite|\.sqlite3)$/i, `_${targetLang}$1`);
        }

        for (const tableName of selectedTables) {
            if (stopRef.current) break;
            setCurrentProcessingTable(tableName);
            
            const res = sourceDb.exec(`SELECT rowid as _row_id_, * FROM ${tableName}`);
            if (res.length === 0) {
                addLog('WARN', `Table ${tableName} is empty. Skipping.`);
                continue;
            }

            const columns = res[0].columns;
            const values = res[0].values;
            const tableRows = values.map((row: any[]) => {
                const obj: any = {};
                columns.forEach((col: string, i: number) => obj[col] = row[i]);
                return obj;
            });

            const targetColumns = identifyTargetColumns(tableName, columns.filter(c => c !== '_row_id_'));
            if (targetColumns.length === 0) {
                addLog('WARN', `Table ${tableName} has no translatable columns. Skipping.`);
                continue;
            }

            const batchItems = tableRows.map((d: any) => {
                const data: any = Object.fromEntries(targetColumns.map(col => [col, d[col]]));
                if (d.sex !== undefined) {
                    data.sex = d.sex;
                }
                return { rowid: d._row_id_, data };
            });

            addLog('DB', `Processing ${tableName}: ${batchItems.length} rows, Cols: [${targetColumns.join(', ')}]`);

            const resultMap = new Map<number, any>();
            await processBatchQueue(batchItems, 50, async (batch) => {
                 const res = await gemini.translateDatabaseBatch(batch as DBBatchItem[], targetLang, 'translate');
                 res.forEach(r => resultMap.set(r.rowid, r.translatedData));
            }, (c) => setProgress(Math.round((c/batchItems.length)*100)), () => stopRef.current, addLog, 2000);

            if (stopRef.current) break;

            addLog('DB', `Updating Database table: ${tableName}...`);
            writableDb.exec("BEGIN TRANSACTION;");
            try {
                resultMap.forEach((translatedData, rowid) => {
                     const colsToUpdate = Object.keys(translatedData).filter(c => c !== 'sex');
                     const updates = colsToUpdate.map(col => `${col} = ?`);
                     const params = colsToUpdate.map(col => translatedData[col]);

                     if (updates.length > 0) {
                         writableDb.run(`UPDATE ${tableName} SET ${updates.join(', ')} WHERE rowid = ?`, [...params, rowid]);
                     }
                });
                writableDb.exec("COMMIT;");
            } catch (e: any) {
                writableDb.exec("ROLLBACK;");
                throw new Error(`Failed to update ${tableName}: ${e.message}`);
            }
        }

        if (!stopRef.current) {
            const binary = writableDb.export();
            await workspaceService.saveFile({
                id: Math.random().toString(),
                name: outputFileName,
                content: binary,
                type: 'destination',
                mimeType: 'application/vnd.sqlite3',
                size: binary.length,
                createdAt: new Date(),
                module: 'database'
            });
            resolve(`Saved to Workspace: ${outputFileName}`);
        } else {
            reject(new Error('Process was stopped.'));
        }

        writableDb.close();
        sourceDb.close();
      } catch (e: any) {
        reject(e);
      }
    });

    toast.promise(promise, {
        loading: 'Starting database translation...',
        success: (msg) => msg,
        error: (err) => `Error: ${err.message}`,
    }).finally(() => {
        setStatus('idle');
    });
  };

  const renderTable = () => {
      if (data.length === 0) return <div className="p-8 text-center text-slate-400 text-xs">Select a table to preview data</div>;
      const columns = Object.keys(data[0]);
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
                      {data.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-primary-50/30 transition-colors">
                              {columns.slice(0,8).map(c => <td key={c} className="p-3 truncate max-w-[200px] border-r border-slate-50" title={JSON.stringify(r[c])}>{String(r[c])}</td>)}
                              {columns.length > 8 && <td className="p-3 text-slate-400">...</td>}
                          </tr>
                      ))}
                  </tbody>
              </table>
              <div className="p-2 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-500">Previewing first 100 rows of {previewTable}</div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-white">
       <div className="px-6 py-4 border-b border-slate-200 flex flex-col gap-4 bg-white shadow-sm z-30 relative">
           <div className="flex justify-between items-center">
                <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Database Translator</h2>
                        <span className="text-[10px] text-slate-500">Source: {file ? file.name : 'None'}</span>
                    </div>
                    
                    {file && (
                        <>
                            <div className="h-8 w-px bg-slate-200"></div>
                            <TableSelector 
                                tables={tables} 
                                selectedTables={selectedTables} 
                                onChange={setSelectedTables} 
                            />
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">To:</label>
                                <select value={targetLang} onChange={e => setTargetLang(e.target.value as any)} className="bg-slate-50 border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-1.5 outline-none font-bold">
                                    {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                                </select>
                            </div>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                     <Button onClick={handleProcess} isLoading={status === 'processing'} disabled={!file || selectedTables.length === 0} className="px-6">
                        {targetFile ? 'Overwrite Target DB' : 'Translate Start'}
                     </Button>
                </div>
           </div>

           {file && (
               <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                   <div className="flex items-center gap-2 flex-1">
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Database (Optional):</span>
                       {targetFile ? (
                           <div className="flex items-center gap-2 bg-white px-3 py-1 rounded border border-green-200 text-green-700 text-xs font-bold">
                               <Database className="w-3.5 h-3.5" /> {targetFile.name}
                               <button onClick={() => { setTargetFile(null); targetDbBufferRef.current = null; }} className="ml-2 hover:bg-green-50 p-0.5 rounded"><ArrowRight className="w-3 h-3 rotate-45" /></button>
                           </div>
                       ) : (
                           <div className="flex items-center gap-2">
                               <input type="file" ref={targetInputRef} onChange={handleTargetChange} accept=".db,.sqlite" className="hidden" />
                               <button onClick={() => targetInputRef.current?.click()} className="text-[10px] flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-600 px-2 py-1 rounded transition-colors">
                                   <Upload className="w-3 h-3" /> Select Target .db to Overwrite
                               </button>
                               <span className="text-[10px] text-slate-400 italic">If skipped, creates a copy of Source DB.</span>
                           </div>
                       )}
                   </div>
                   <div className="text-[10px] text-slate-400 font-mono">
                       {selectedTables.length} tables selected for processing
                   </div>
               </div>
           )}
       </div>

       <div className="flex-1 overflow-hidden bg-slate-50 p-6 flex flex-col">
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
                            <h3 className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Load Source Database</h3>
                            <p className="text-slate-500 text-[11px] font-medium tracking-wide">Select the .db file to read from</p>
                          </div>
                        </div>
                      </div>
                   </div>
               </div>
           ) : (
               <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                   <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                       <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                           <Database className="w-4 h-4 text-pink-500" />
                           Preview: {previewTable || 'None'}
                       </span>
                       <button onClick={() => { setFile(null); setData([]); setTables([]); dbBufferRef.current = null; }} className="text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded font-bold transition-colors">Close File</button>
                   </div>
                   <div className="flex-1 overflow-hidden p-6 bg-slate-50">
                       {renderTable()}
                   </div>
               </div>
           )}
       </div>
       {status === 'processing' && (
           <div className="p-6 bg-white border-t border-slate-200">
               <div className="flex justify-between text-xs font-bold mb-2">
                   <span>Processing {currentProcessingTable}...</span>
                   <span>{progress}%</span>
               </div>
               <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200">
                   <div className="h-full bg-primary-600 transition-all duration-300 relative" style={{ width: `${progress}%` }}>
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                   </div>
               </div>
           </div>
        )}
    </div>
  );
});
