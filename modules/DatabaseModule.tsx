
import React, { useState, useRef, useImperativeHandle } from 'react';
import { Database, FileUp, Save, ArrowRight, Upload, Split, Wand2, Scroll, Settings2 } from 'lucide-react';
import { TargetLanguage, StoredFile, FileData } from '../types';
import { GeminiService, DBBatchItem } from '../services/geminiService';
import { workspaceService } from '../services/workspaceService';
import { Button } from '../components/Button';
import { TableSelector } from '../components/TableSelector';
import { LANGUAGES } from '../constants';
import { identifyTargetColumns } from '../utils/parser';
import { ToastType } from '../components/Toast';

interface Props {
  customApiKey: string;
  addLog: (module: string, message: string) => void;
  notify: (type: ToastType, message: string) => void;
}

const OptionToggle = ({ active, onClick, icon, label, tooltip, disabled }: any) => {
  if (disabled) return null;
  return (
    <button 
      onClick={onClick}
      title={tooltip}
      className={`h-7 px-2.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border shadow-sm ${active ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
    >
      {icon} {label}
    </button>
  );
};

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

export const DatabaseModule = React.forwardRef<any, Props>(({ customApiKey, addLog, notify }, ref) => {
  const [file, setFile] = useState<FileData | null>(null);
  const [targetFile, setTargetFile] = useState<FileData | null>(null);
  
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  
  const [selectedLang, setSelectedLang] = useState<string>(TargetLanguage.Hindi);
  const [customLang, setCustomLang] = useState<string>('');

  // Options
  const [dualSexMode, setDualSexMode] = useState(false);
  const [shlokaMode, setShlokaMode] = useState(false);
  const [sanskritMode, setSanskritMode] = useState(false);

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
             notify('success', 'Database loaded');
        } else {
             addLog('ERR', 'Unsupported file format. Please load a .db file.');
             notify('error', 'Unsupported file format');
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
          
          setFile({ name: fileName, content: "SQLite Binary", id: Math.random().toString(36).substr(2, 9) });
          db.close();

      } catch (e: any) {
          addLog('ERR', `DB Load Failed: ${e.message}`);
          notify('error', `DB Load Failed: ${e.message}`);
      }
  };

  const loadTargetDb = async (buffer: Uint8Array, fileName: string) => {
      try {
          addLog('DB', `Loaded Target DB: ${fileName}`);
          targetDbBufferRef.current = buffer;
          setTargetFile({ name: fileName, content: "Target DB", id: Math.random().toString(36).substr(2, 9) });
      } catch (e: any) {
          addLog('ERR', `Target DB Load Failed: ${e.message}`);
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
        try {
            const buffer = await f.arrayBuffer();
            const uint8 = new Uint8Array(buffer);
            await processDbBuffer(uint8, f.name);
            // SAVE TO WORKSPACE
            workspaceService.saveFile({
                id: Math.random().toString(36).substr(2, 9),
                name: f.name,
                type: 'source',
                content: uint8,
                mimeType: 'application/vnd.sqlite3',
                size: uint8.length,
                createdAt: new Date(),
                module: 'database'
            }).then(() => notify('info', `Saved ${f.name} to Workspace`));
        } catch (e: any) {
            addLog('ERR', `File Read Error: ${e.message}`);
        }
    }
  };

  const handleTargetChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
        try {
            const buffer = await f.arrayBuffer();
            const uint8 = new Uint8Array(buffer);
            await loadTargetDb(uint8, f.name);
             workspaceService.saveFile({
                id: Math.random().toString(36).substr(2, 9),
                name: f.name,
                type: 'source',
                content: uint8,
                mimeType: 'application/vnd.sqlite3',
                size: uint8.length,
                createdAt: new Date(),
                module: 'database'
            }).then(() => notify('info', `Saved Target ${f.name} to Workspace`));
        } catch (e: any) {
            addLog('ERR', `Target Read Error: ${e.message}`);
        }
    }
  };

  // Mutually Exclusive Toggles
  const toggleShloka = () => {
    if (!shlokaMode) setSanskritMode(false);
    setShlokaMode(!shlokaMode);
  };

  const toggleSanskrit = () => {
    if (!sanskritMode) setShlokaMode(false);
    setSanskritMode(!sanskritMode);
  };

  const handleProcess = async () => {
     if (selectedTables.length === 0) return;
     if (!dbBufferRef.current) return;

     stopRef.current = false;
     setStatus('processing');
     const gemini = new GeminiService(customApiKey);

     const effectiveLang = selectedLang === TargetLanguage.Other ? customLang : selectedLang;
     if (!effectiveLang.trim()) {
         addLog('ERR', 'Please specify a target language.');
         notify('error', 'Target language required');
         setStatus('idle');
         return;
     }

     try {
        // @ts-ignore
        const SQL = await window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });
        const sourceDb = new SQL.Database(dbBufferRef.current);
        
        let writableDb: any;
        let outputFileName = '';

        if (targetFile && targetDbBufferRef.current) {
            // Case 1: Write to Target DB
            writableDb = new SQL.Database(targetDbBufferRef.current);
            addLog('DB', 'Processing will OVERWRITE data in the Target Database.');
            outputFileName = targetFile.name.replace('.db', `_${effectiveLang}.db`);
        } else {
            // Case 2: Clone Source DB
            writableDb = new SQL.Database(dbBufferRef.current);
            addLog('DB', 'No Target DB selected. Creating translated copy of Source DB.');
            outputFileName = file!.name.replace(/(\.db|\.sqlite|\.sqlite3)$/i, `_${effectiveLang}$1`);
        }

        // Iterate Selected Tables
        for (const tableName of selectedTables) {
            if (stopRef.current) break;
            setCurrentProcessingTable(tableName);
            
            // 1. Fetch ALL Data from Source
            const res = sourceDb.exec(`SELECT rowid as _row_id_, * FROM ${tableName}`);
            if (res.length === 0) {
                addLog('WARN', `Table ${tableName} is empty. Skipping.`);
                continue;
            }

            const columns = res[0].columns;
            const values = res[0].values;
            const tableRows = values.map((row: any[]) => {
                const obj: any = {};
                columns.forEach((col: string, i: number) => {
                    let val = row[i];
                    // FIX: Decode Uint8Array to String if necessary
                    if (val && typeof val === 'object' && (val instanceof Uint8Array || Array.isArray(val))) {
                        try { val = new TextDecoder("utf-8").decode(val instanceof Uint8Array ? val : new Uint8Array(val)); } catch (e) {}
                    }
                    obj[col] = val;
                });
                return obj;
            });

            // 2. Identify Targets
            const targetColumns = identifyTargetColumns(tableName, columns.filter(c => c !== '_row_id_'));
            if (targetColumns.length === 0) {
                addLog('WARN', `Table ${tableName} has no translatable columns. Skipping.`);
                continue;
            }

            // 3. Prepare Batches
            const batchItems = tableRows.map((d: any, i: number) => {
                const filteredData: any = {};
                targetColumns.forEach(col => filteredData[col] = d[col]);
                if (d.sex !== undefined) filteredData.sex = d.sex;
                return { rowid: d._row_id_, data: filteredData };
            });

            addLog('DB', `Processing ${tableName}: ${batchItems.length} rows, Cols: [${targetColumns.join(', ')}]`);

            // 4. Translate
            const resultMap = new Map<number, any>();
            await processBatchQueue(batchItems, 50, async (batch, _, retry) => {
                 const res = await gemini.translateDatabaseBatch(
                     batch as DBBatchItem[], 
                     effectiveLang, 
                     'translate',
                     { transliterate: shlokaMode, keepSanskrit: sanskritMode }
                 );
                 res.forEach(r => resultMap.set(r.rowid, r.translatedData));
            }, (c) => setProgress(Math.round((c/batchItems.length)*100)), () => stopRef.current, addLog, 2000);

            if (stopRef.current) break;

            // 5. Update Writable DB
            addLog('DB', `Updating Database table: ${tableName}...`);
            writableDb.exec("BEGIN TRANSACTION;");
            try {
                resultMap.forEach((translatedData, rowid) => {
                     const updates: string[] = [];
                     const params: any[] = [];
                     
                     Object.keys(translatedData).forEach(col => {
                         if (col !== 'sex') {
                             updates.push(`${col} = ?`);
                             params.push(translatedData[col]);
                         }
                     });
                     
                     if (updates.length > 0) {
                         params.push(rowid);
                         writableDb.run(`UPDATE ${tableName} SET ${updates.join(', ')} WHERE rowid = ?`, params);
                     }
                });
                writableDb.exec("COMMIT;");
            } catch (e: any) {
                writableDb.exec("ROLLBACK;");
                addLog('ERR', `Failed to update ${tableName}: ${e.message}`);
            }
        }

        // Final Export
        if (!stopRef.current) {
            const binary = writableDb.export();
            workspaceService.saveFile({
                id: Math.random().toString(36).substr(2, 9),
                name: outputFileName,
                content: binary,
                type: 'destination',
                mimeType: 'application/vnd.sqlite3',
                size: binary.length,
                createdAt: new Date(),
                module: 'database'
            });
            addLog('DB', `SAVED DATABASE (.db): ${outputFileName}`);
            notify('success', 'Database Translation Completed');
        }

        writableDb.close();
        sourceDb.close();
        addLog('DB', 'All operations completed.');

     } catch(e: any) { 
        addLog('ERR', e.message); 
        notify('error', e.message);
    }
     setStatus('idle');
  };

  return (
    <div className="flex flex-col h-full bg-white">
       <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-30 relative h-12">
            <div className="flex items-center gap-6">
                <div className="flex flex-col">
                    <h2 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Database Translator</h2>
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
                             <select value={selectedLang} onChange={e => setSelectedLang(e.target.value)} className="h-7 bg-slate-50 border border-slate-300 text-slate-700 text-[10px] rounded-md focus:ring-primary-500 focus:border-primary-500 block px-1 outline-none font-bold">
                                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                             </select>
                             {selectedLang === TargetLanguage.Other && (
                                <input 
                                  type="text" 
                                  placeholder="Lang..." 
                                  value={customLang}
                                  onChange={e => setCustomLang(e.target.value)}
                                  className="h-7 w-20 bg-white border border-slate-300 text-slate-900 text-[10px] rounded-md focus:ring-primary-500 focus:border-primary-500 block px-2 outline-none font-bold placeholder-slate-400"
                                />
                             )}
                        </div>
                        <div className="h-5 w-px bg-slate-300 mx-1"></div>
                        <div className="flex items-center gap-1.5">
                            <OptionToggle active={dualSexMode} onClick={() => setDualSexMode(!dualSexMode)} icon={<Split className="w-3.5 h-3.5"/>} label="Dual Sex" />
                            <OptionToggle active={shlokaMode} onClick={toggleShloka} icon={<Wand2 className="w-3.5 h-3.5"/>} label="Transl" />
                            <OptionToggle active={sanskritMode} onClick={toggleSanskrit} icon={<Scroll className="w-3.5 h-3.5"/>} label="Sanskrit" />
                        </div>
                    </div>
                )}
            </div>
            {file && (
                <div className="flex items-center gap-2">
                     <Button size="sm" onClick={handleProcess} isLoading={status === 'processing'} disabled={selectedTables.length === 0} className="px-3 h-7 text-xs bg-primary-600 hover:bg-primary-700">
                        {targetFile ? 'Overwrite Target' : 'Start Process'}
                     </Button>
                </div>
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
                            <h3 className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Load Source Database</h3>
                            <p className="text-slate-500 text-[11px] font-medium tracking-wide">Select the .db file to read from</p>
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
                                <Database className="w-5 h-5 text-pink-500" />
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
                        {/* Left: Settings & Rules */}
                        <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                            
                            {/* Target DB Selector */}
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Settings2 className="w-4 h-4"/> Target Database (Optional)
                                </h4>
                                {targetFile ? (
                                   <div className="flex items-center justify-between bg-white px-3 py-2 rounded border border-green-200 shadow-sm">
                                       <div className="flex items-center gap-2">
                                           <Database className="w-4 h-4 text-green-600" />
                                           <div>
                                               <div className="text-xs font-bold text-green-700">{targetFile.name}</div>
                                               <div className="text-[9px] text-green-600">Will be overwritten</div>
                                           </div>
                                       </div>
                                       <button onClick={() => { setTargetFile(null); targetDbBufferRef.current = null; }} className="text-slate-400 hover:text-red-500"><Settings2 className="w-4 h-4 rotate-45" /></button>
                                   </div>
                                ) : (
                                   <div className="flex items-center gap-2">
                                       <input type="file" ref={targetInputRef} onChange={handleTargetChange} accept=".db,.sqlite" className="hidden" />
                                       <button onClick={() => targetInputRef.current?.click()} className="w-full text-xs flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-dashed border-slate-300 text-slate-500 px-4 py-3 rounded transition-all hover:border-slate-400 hover:text-slate-700">
                                           <Upload className="w-4 h-4" /> Click to Select Target .db to Overwrite
                                       </button>
                                   </div>
                                )}
                                <p className="text-[10px] text-slate-400 mt-2">If no target is selected, a new translated copy of the source will be created.</p>
                            </div>

                            {/* Rules */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Wand2 className="w-4 h-4" /> Translation Logic
                                </h4>
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">Column Detection</p>
                                            <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                                Automatically identifies translatable columns (Text, Prediction, Question, Category) and ignores IDs and metadata.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-3">
                                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">Row Integrity</p>
                                            <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                                                Uses <code>rowid</code> to map translations back to the exact row. Updates are transactional per batch.
                                            </p>
                                        </div>
                                    </div>
                                    {dualSexMode && (
                                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                                            <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></div>
                                            <div>
                                                <p className="text-xs font-bold text-blue-700">Dual Sex Mode Active</p>
                                                <p className="text-[10px] text-blue-600 leading-relaxed mt-0.5">
                                                    Will attempt to generate gender-specific variations if the table structure supports it.
                                                </p>
                                            </div>
                                        </div>
                                    )}
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
                                        <div className="w-1 h-1 rounded-full bg-pink-500"></div>
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
                             {targetFile ? 'Overwrite mode enabled.' : 'Clone mode enabled.'}
                        </span>
                        <button onClick={() => { setFile(null); setTables([]); dbBufferRef.current = null; }} className="text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded transition-colors">
                            Close Database
                        </button>
                    </div>
                </div>
           )}
       </div>
       {status === 'processing' && (
           <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8">
               <div className="w-full max-w-md bg-white border border-slate-200 shadow-2xl rounded-xl p-6">
                   <div className="flex items-center gap-3 mb-4">
                       <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
                       <h3 className="text-sm font-bold text-slate-800">Processing Database...</h3>
                   </div>
                   <div className="flex justify-between text-xs font-bold mb-1 text-slate-500">
                       <span>Table: {currentProcessingTable}</span>
                       <span>{progress}%</span>
                   </div>
                   <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                       <div className="h-full bg-primary-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                   </div>
                   <button onClick={() => stopRef.current = true} className="mt-6 w-full py-2 bg-red-50 text-red-600 font-bold text-xs rounded hover:bg-red-100 transition-colors">
                       Stop Operation
                   </button>
               </div>
           </div>
        )}
    </div>
  );
});
