
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, Download, Languages, Split, Sparkles, Wand2, XCircle, 
  CheckCircle2, RefreshCw, Check, Scroll, BookOpen, Info, HelpCircle, 
  FileText, ChevronRight, Settings2, ChevronDown, ChevronUp, AlertCircle, FileCode, Code, Database, Search, Filter, List, FolderOpen, Trash2, Save, File, HardDrive, ArrowRightLeft, Key, Terminal, DownloadCloud, LayoutTemplate, X, LogOut, User, PlusCircle
} from 'lucide-react';
import { LANGUAGES } from './constants';
import { 
  TargetLanguage, ProcessingMode, ProcessingItem, BatchResponse, 
  AppStatus, SourceLanguage, ResourceTranslationResult, ProcessingError, DatabaseTask, StoredFile 
} from './types';
import { GeminiService } from './services/geminiService';
import { workspaceService } from './services/workspaceService';
import { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } from './utils/parser';
import { Button } from './components/Button';
import FileUpload from './components/FileUpload';
import CodeBlock from './components/CodeBlock';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';

type AppModule = 'predictions' | 'resources' | 'database';

interface FileData {
  name: string;
  content: string;
  id: string;
}

interface LogEntry {
  timestamp: string;
  module: string;
  message: string;
}

// --- BATCH QUEUE UTILITY ---
// Helper to process items with controlled concurrency (e.g., 50 parallel requests)
async function processBatchQueue<T>(
  items: T[], 
  batchSize: number, 
  concurrency: number,
  processFn: (batch: T[], startIndex: number) => Promise<void>,
  onProgress: (processedCount: number) => void,
  checkStop: () => boolean
) {
  // 1. Chunk items
  const chunks: { data: T[], index: number }[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push({ data: items.slice(i, i + batchSize), index: i });
  }

  // 2. Queue workers
  const queue = [...chunks];
  let processedCount = 0;

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      if (checkStop()) return;
      const job = queue.shift();
      if (!job) break;

      try {
        await processFn(job.data, job.index);
        processedCount += job.data.length;
        onProgress(processedCount);
      } catch (err) {
        console.error("Batch processing error (handled in worker):", err);
        // We continue processing other batches even if one fails
      }
    }
  };

  // 3. Start workers
  const workers = Array(Math.min(concurrency, chunks.length)).fill(null).map(() => worker());
  await Promise.all(workers);
}

// --- HELPER COMPONENTS (STYLED) ---

interface ModeButtonProps {
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
}

const ModeButton: React.FC<ModeButtonProps> = ({ isActive, onClick, icon, label, tooltip }) => (
  <button 
    onClick={onClick}
    title={tooltip}
    className={`
      h-9 px-4 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 border shadow-sm
      ${isActive 
        ? 'bg-primary-600 border-primary-500 text-white shadow-[0_2px_8px_rgba(124,58,237,0.39)]' 
        : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }
    `}
  >
    {icon} {label}
  </button>
);

interface OptionToggleProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  disabled?: boolean;
}

const OptionToggle: React.FC<OptionToggleProps> = ({ active, onClick, icon, label, tooltip, disabled }) => {
  if (disabled) return null;
  return (
    <button 
      onClick={onClick}
      title={tooltip}
      className={`
        h-9 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 border shadow-sm
        ${active 
          ? 'bg-slate-800 border-slate-700 text-white' 
          : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        }
      `}
    >
      {icon} {label}
    </button>
  );
};

const TerminalWindow = ({ logs }: { logs: LogEntry[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const downloadLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.module}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translation_logs_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
  };

  return (
    <div className="h-36 bg-slate-50 border-t border-slate-200 flex flex-col font-mono text-[11px] shrink-0">
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
          <Terminal className="w-3 h-3" /> System Output
        </div>
        <button onClick={downloadLogs} className="text-[10px] flex items-center gap-1 text-primary-600 hover:text-primary-700 font-bold" title="Download Log">
           <DownloadCloud className="w-3 h-3" /> Export Logs
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar bg-white">
        {logs.length === 0 ? (
          <div className="text-slate-400 italic">System ready...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-3 border-b border-slate-50 pb-1">
              <span className="text-slate-400 shrink-0 select-none">[{log.timestamp}]</span>
              <span className={`font-bold shrink-0 ${log.module === 'ERR' ? 'text-red-600' : log.module === 'DB' ? 'text-pink-600' : log.module === 'RES' ? 'text-blue-600' : 'text-primary-600'}`}>[{log.module}]</span>
              <span className="text-slate-600">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('predictions');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Refs to expose load methods from modules
  const predictionsRef = useRef<{ loadFile: (f: StoredFile) => void }>(null);
  const resourcesRef = useRef<{ loadFile: (f: StoredFile) => void }>(null);
  const databaseRef = useRef<{ loadFile: (f: StoredFile) => void }>(null);

  const addLog = useCallback((module: string, message: string) => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), module, message }]);
  }, []);

  const saveSettings = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
    setIsSettingsOpen(false);
  };

  const handleWorkspaceLoad = (file: StoredFile) => {
    if (file.module !== activeModule) {
      alert(`Cannot load ${file.module} file into ${activeModule} module.`);
      return;
    }
    
    try {
      if (activeModule === 'predictions' && predictionsRef.current) {
        predictionsRef.current.loadFile(file);
      } else if (activeModule === 'resources' && resourcesRef.current) {
        resourcesRef.current.loadFile(file);
      } else if (activeModule === 'database' && databaseRef.current) {
        databaseRef.current.loadFile(file);
      }
      setIsWorkspaceOpen(false);
      addLog('SYS', `Loaded file from workspace: ${file.name}`);
    } catch (e: any) {
      addLog('ERR', `Failed to load file: ${e.message}`);
    }
  };

  // Nav Item Component
  const NavItem = ({ id, label, icon }: { id: AppModule, label: string, icon: React.ReactNode }) => (
    <button 
      onClick={() => setActiveModule(id)}
      className={`
        px-5 py-2.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-2.5 relative border
        ${activeModule === id 
          ? 'text-white bg-slate-800 shadow-sm border-slate-700' 
          : 'text-slate-500 bg-white border-transparent hover:text-slate-700 hover:bg-slate-50'
        }
      `}
    >
      {icon} 
      {label}
    </button>
  );

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden selection:bg-primary-100 selection:text-primary-900">
      {/* --- HEADER --- */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 z-[100] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-primary-600 p-2 rounded-lg shadow-md shadow-primary-200">
            <Sparkles className="w-5 h-5 text-white fill-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-slate-900 tracking-tight uppercase">AI Translation</h1>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Localizer Suite</span>
          </div>
        </div>

        {/* --- CENTRAL NAVIGATION --- */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/50 rounded-xl border border-slate-200">
           <NavItem id="predictions" label="Predictions" icon={<FileText className="w-3.5 h-3.5"/>} />
           <NavItem id="resources" label="Resources" icon={<Code className="w-3.5 h-3.5"/>} />
           <NavItem id="database" label="Database" icon={<Database className="w-3.5 h-3.5"/>} />
        </div>

        <div className="flex items-center gap-2">
           <button onClick={() => setIsWorkspaceOpen(true)} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors border border-transparent hover:border-slate-200 font-bold text-[11px] uppercase tracking-wide" title="Workspace">
              <HardDrive className="w-4 h-4 text-primary-600" />
              Workspace
           </button>
           <div className="h-6 w-px bg-slate-200 mx-1"></div>
           <button onClick={() => setIsHelpOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors" title="Documentation">
              <HelpCircle className="w-5 h-5" />
           </button>
           <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors" title="Settings">
              <Settings2 className="w-5 h-5" />
           </button>
        </div>
      </header>

      {/* --- WORKSPACE DRAWER --- */}
      <WorkspaceDrawer 
        isOpen={isWorkspaceOpen} 
        onClose={() => setIsWorkspaceOpen(false)} 
        activeModule={activeModule}
        onLoadFile={handleWorkspaceLoad}
      />

      {/* --- SETTINGS MODAL --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
           <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full shadow-xl">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-bold text-slate-900">Settings</h2>
                 <button onClick={() => setIsSettingsOpen(false)}><XCircle className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
              </div>
              <div className="space-y-4">
                 
                 <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">API Key</label>
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 transition-all">
                       <Key className="w-4 h-4 text-slate-400 mr-2" />
                       <input 
                         type="text" 
                         className="bg-transparent border-none text-slate-800 text-sm focus:outline-none flex-1 py-2.5 placeholder-slate-400 font-mono"
                         placeholder="Paste your API key..."
                         defaultValue={apiKey}
                         onChange={(e) => setApiKey(e.target.value)}
                       />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">Key is stored locally in your browser.</p>
                 </div>

                 <div className="flex justify-end mt-6">
                    <Button onClick={() => saveSettings(apiKey)} variant="primary">Save Changes</Button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- HELP / DOCUMENTATION MODAL --- */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
           <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white">
                 <div className="flex items-center gap-3">
                   <div className="bg-primary-50 p-2 rounded-lg text-primary-600"><BookOpen className="w-5 h-5" /></div>
                   <h2 className="text-xl font-bold text-slate-900">User Documentation</h2>
                 </div>
                 <button onClick={() => setIsHelpOpen(false)}><XCircle className="w-6 h-6 text-slate-400 hover:text-slate-600" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-50">
                 <section className="space-y-3">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><HardDrive className="w-4 h-4 text-primary-600"/> Persistent Workspace</h3>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 text-sm text-slate-600 space-y-4 leading-relaxed shadow-sm">
                    <p>The application features a server-backed persistent workspace.</p>
                    <ul className="list-disc pl-5 space-y-2 text-slate-500">
                      <li><strong>Persistence:</strong> Files are saved to the server's disk, ensuring they are never lost.</li>
                      <li><strong>Single User Mode:</strong> All sessions share the same 'default' workspace folder on the server.</li>
                      <li><strong>Auto-Save:</strong> All imported source files and generated translations/logs are automatically saved.</li>
                    </ul>
                  </div>
                </section>
                 <section className="space-y-3">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4 text-primary-600"/> Predictions Module</h3>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 text-sm text-slate-600 space-y-4 leading-relaxed shadow-sm">
                    <p>Designed for processing structured astrology block files.</p>
                  </div>
                </section>
              </div>
           </div>
        </div>
      )}

      {/* --- MAIN CONTENT AREA --- */}
      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'predictions' ? 'flex' : 'hidden'}`}>
        <PredictionsModule customApiKey={apiKey} addLog={addLog} ref={predictionsRef} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'resources' ? 'flex' : 'hidden'}`}>
        <ResourcesModule customApiKey={apiKey} addLog={addLog} ref={resourcesRef} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'database' ? 'flex' : 'hidden'}`}>
        <DatabaseModule customApiKey={apiKey} addLog={addLog} ref={databaseRef} />
      </div>

      <TerminalWindow logs={logs} />
    </div>
  );
}

/**
 * MODULE 1: PREDICTIONS TOOL (Block Based)
 */
const PredictionsModule = React.forwardRef(({ customApiKey, addLog }: { customApiKey: string, addLog: (m: string, msg: string) => void }, ref) => {
  const [files, setFiles] = useState<FileData[]>([
    { name: 'Default_Example.txt', content: `FileHeader.txt\n\n#* Planet=0,Case=0\n##*Text\nYou have debilitated Jupiter in lagna which is under the influence of <PlanetInfluence>.\nAs a successful businessperson, you should recite Hanuman Chalisa daily.\n\n#* Planet=0,Case=1\n##*Text\nv©"kf/k ef.k  ea=k.kka]  xzg&u{k=  rkfjdk A\nÒkX;dkys ÒosfRlf)% vÒkX;a fu"Qya Òosr AA`, id: 'default' }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('default');
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  
  const [selectedLangs, setSelectedLangs] = useState<string[]>([TargetLanguage.Hindi]);
  const [customLangInput, setCustomLangInput] = useState('');
  const [mode, setMode] = useState<ProcessingMode>('translate');
  const [dualSexMode, setDualSexMode] = useState(false);
  const [shlokaMode, setShlokaMode] = useState(false);
  const [sanskritMode, setSanskritMode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'stopped' | 'error'>('idle');
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [progress, setProgress] = useState({ blocksSent: 0, blocksTotal: 0, currentFileName: '' });
  const stopProcessingRef = useRef(false);

  // Expose load method
  React.useImperativeHandle(ref, () => ({
    loadFile: (file: StoredFile) => {
      if (typeof file.content !== 'string') throw new Error("File content must be string");
      const newId = Math.random().toString(36).substr(2, 9);
      setFiles(p => [...p, { name: file.name, content: file.content as string, id: newId }]);
      setActiveFileId(newId);
    }
  }));

  // Helper to save to workspace
  const saveToWorkspace = async (name: string, content: string, type: 'source' | 'destination') => {
    try {
      await workspaceService.saveFile({
        id: Math.random().toString(36).substr(2, 9),
        name,
        content,
        type,
        mimeType: 'text/plain',
        size: new Blob([content]).size,
        createdAt: new Date(),
        module: 'predictions'
      });
    } catch (e: any) {
      addLog('ERR', `Workspace Save Failed (${type}): ${e.message}`);
    }
  };

  const downloadFile = (fileName: string, content: string) => {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog('SYS', `Downloaded: ${fileName}`);
    
    // Auto Save to Workspace
    saveToWorkspace(fileName, content, 'destination');
  };

  const handleStop = () => {
    stopProcessingRef.current = true;
    setStatus('stopped');
    addLog('PRED', 'Process stopped by user.');
  };

  const handleProcess = async () => {
    stopProcessingRef.current = false;
    setStatus('processing');
    setOutputs({});
    
    const activeLangs = mode === 'rewrite' ? ['Default'] : selectedLangs;
    const gemini = new GeminiService(customApiKey);

    try {
      for (let fIndex = 0; fIndex < files.length; fIndex++) {
        if (stopProcessingRef.current) break;
        const currentFile = files[fIndex];
        
        setActiveFileId(currentFile.id); 
        
        addLog('PRED', `Processing file: ${currentFile.name}`);
        setProgress(p => ({ ...p, currentFileName: currentFile.name }));

        for (let lIndex = 0; lIndex < activeLangs.length; lIndex++) {
          if (stopProcessingRef.current) { setStatus('stopped'); return; }
          const currentLang = activeLangs[lIndex] === TargetLanguage.Other ? customLangInput : activeLangs[lIndex];
          
          if (!currentLang) continue;

          addLog('PRED', `Translating to: ${currentLang}`);
          const { preamble, blocks } = parseInputFile(currentFile.content);
          const baseTargetBlocks: any[] = [];
          blocks.forEach(block => {
            if (dualSexMode) {
              baseTargetBlocks.push({ header: updateHeaderSex(block.header, 0), lines: [...block.contentLines], gender: 'Male' });
              baseTargetBlocks.push({ header: updateHeaderSex(block.header, 1), lines: [...block.contentLines], gender: 'Female' });
            } else {
              baseTargetBlocks.push({ header: block.header, lines: [...block.contentLines], gender: getGenderFromHeader(block.header) });
            }
          });

          const processingItems: ProcessingItem[] = [];
          baseTargetBlocks.forEach((block, blockIdx) => {
            const translatableMap = identifyTranslatableLines(block.lines);
            block.lines.forEach((line, lineIdx) => {
              if (translatableMap[lineIdx]) processingItems.push({ text: line, context: block.gender, blockId: `b${blockIdx}`, lineIndex: lineIdx });
            });
          });

          const totalItems = processingItems.length;
          setProgress(p => ({ ...p, blocksTotal: totalItems, blocksSent: 0 }));
          
          const BATCH_SIZE = 12; // Slightly smaller batch size for better granularity with parallelism
          const CONCURRENCY_LIMIT = 50; // High concurrency

          // Execute Parallel Processing
          if (totalItems > 0) {
            await processBatchQueue(
              processingItems,
              BATCH_SIZE,
              CONCURRENCY_LIMIT,
              async (batch, startIndex) => {
                const results: BatchResponse[] = await gemini.translateBatch(
                  batch.map(item => ({ text: item.text, context: item.context })), 
                  currentLang, 
                  mode, 
                  shlokaMode, 
                  sanskritMode
                );
                batch.forEach((item, idx) => {
                   const blockIdx = parseInt(item.blockId.substring(1));
                   if (results[idx]) baseTargetBlocks[blockIdx].lines[item.lineIndex] = results[idx].text;
                });
              },
              (processedCount) => {
                  setProgress(prev => ({ ...prev, blocksSent: processedCount }));
              },
              () => stopProcessingRef.current
            );
          }

          let finalOutput = preamble.trimEnd() + '\n\n';
          baseTargetBlocks.forEach((block, idx) => {
            finalOutput += `${block.header}\n${block.lines.join('\n').trimEnd()}${idx < baseTargetBlocks.length - 1 ? '\n\n' : ''}`;
          });
          
          const outputKey = `${currentFile.id}_${currentLang}`;
          setOutputs(prev => ({ ...prev, [outputKey]: finalOutput }));
          addLog('PRED', `Completed ${currentLang} for ${currentFile.name}`);
          
          // Auto Download with CORRECT NAMING CONVENTION
          const nameWithoutExt = currentFile.name.replace(/\.[^/.]+$/, "");
          let options = "";
          if (dualSexMode) options += "_dual_sex";
          if (shlokaMode) options += "_translit";
          if (sanskritMode) options += "_sanskrit";
          
          const finalFileName = `${nameWithoutExt}_${mode}${options}_${currentLang}.txt`;
          
          downloadFile(finalFileName, finalOutput);
        }
      }
      setStatus('done');
    } catch (err: any) {
      if (stopProcessingRef.current) {
         addLog('PRED', 'Stopped by user.');
         setStatus('stopped');
      } else {
         addLog('PRED', `Error: ${err.message}`);
         setStatus('error');
         alert(`Process Failed: ${err.message}`);
      }
    }
  };

  const currentOutput = () => {
    const file = files.find(f => f.id === activeFileId);
    if (!file) return '';
    const activeLangs = mode === 'rewrite' ? ['Default'] : selectedLangs;
    return outputs[`${file.id}_${activeLangs[0]}`] || '';
  };

  const removeFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFiles(prev => {
        const newFiles = prev.filter(f => f.id !== id);
        if (activeFileId === id && newFiles.length > 0) {
            setActiveFileId(newFiles[0].id);
        }
        return newFiles;
    });
  }

  // Handle File Import
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
     // Explicitly type 'f' as File to avoid 'unknown' type error
     if (e.target.files) Array.from(e.target.files).forEach((f: File) => {
       const r = new FileReader(); 
       r.onload = (ev) => {
         const newId = Math.random().toString(36).substr(2, 9);
         const content = ev.target?.result as string;
         setFiles(p => [...p, { name: f.name, content: content, id: newId }]);
         setActiveFileId(newId);
         // Auto Save Source
         saveToWorkspace(f.name, content, 'source');
       };
       r.readAsText(f);
     });
  };

  const handleShlokaClick = () => {
    const newVal = !shlokaMode;
    setShlokaMode(newVal);
    if (newVal) setSanskritMode(false);
  };

  const handleSanskritClick = () => {
    const newVal = !sanskritMode;
    setSanskritMode(newVal);
    if (newVal) setShlokaMode(false);
  };

  return (
    <>
      {/* Control Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-start gap-8 shrink-0 shadow-sm">
        <div className="flex gap-2">
          <ModeButton isActive={mode === 'translate'} onClick={() => setMode('translate')} icon={<Languages className="w-3.5 h-3.5"/>} label="Translate" tooltip="Localize astrology block files." />
          <ModeButton isActive={mode === 'rewrite'} onClick={() => setMode('rewrite')} icon={<RefreshCw className="w-3.5 h-3.5"/>} label="Rewrite" tooltip="Fix grammar and decode KrutiDev." />
        </div>
        
        <div className="h-6 w-px bg-slate-200"></div>

        <div className={`flex items-center gap-2 ${mode === 'rewrite' ? 'opacity-40 pointer-events-none' : ''}`}>
          <button onClick={() => setIsLangModalOpen(true)} className="bg-white hover:bg-slate-50 px-4 h-9 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 flex items-center gap-2 transition-colors">
            <Languages className="w-3.5 h-3.5 text-slate-400"/> {selectedLangs.length} Selected
          </button>
          {selectedLangs.includes(TargetLanguage.Other) && (
             <input 
                type="text" 
                className="h-9 border border-slate-200 rounded-lg px-3 text-[11px] text-slate-800 w-40 focus:border-primary-500 outline-none font-bold bg-white"
                placeholder="Type Language..."
                value={customLangInput}
                onChange={(e) => setCustomLangInput(e.target.value)}
             />
          )}
        </div>

        <div className="h-6 w-px bg-slate-200"></div>

        <div className="flex gap-2">
          <OptionToggle active={dualSexMode} onClick={() => setDualSexMode(!dualSexMode)} icon={<Split className="w-3.5 h-3.5"/>} label="Dual Sex" tooltip="Separate Sex=0 and Sex=1 output." />
          <OptionToggle active={shlokaMode} onClick={handleShlokaClick} icon={<Scroll className="w-3.5 h-3.5"/>} label="Translit" tooltip="Phonetic Mantras." disabled={mode === 'rewrite'} />
          <OptionToggle active={sanskritMode} onClick={handleSanskritClick} icon={<BookOpen className="w-3.5 h-3.5"/>} label="Keep Sanskrit" tooltip="Keep Shlokas in Devanagari." disabled={mode === 'rewrite'} />
        </div>
        
        <div className="ml-auto flex gap-3">
          {status === 'processing' ? (
              <Button variant="destructive" onClick={handleStop} className="shadow-lg shadow-red-500/20">STOP PROCESSING</Button>
          ) : (
              <Button variant="primary" onClick={handleProcess}>Start Processing</Button>
          )}
        </div>
      </div>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden bg-white">
        <div className="flex-1 grid grid-cols-2 gap-4 h-full">
          {/* Source Panel */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 overflow-hidden relative group">
            <div className="bg-white px-4 py-2.5 flex justify-between items-center border-b border-slate-200 shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Source Input</span>
              <div className="flex items-center gap-3">
                 <button onClick={() => document.getElementById('blockInput')?.click()} className="text-[10px] font-bold text-slate-500 hover:text-primary-600 transition-colors">Import Files</button>
                 <input id="blockInput" type="file" multiple className="hidden" onChange={handleFileImport} />
              </div>
            </div>
            
            {/* File Tabs */}
            <div className="flex gap-1 overflow-x-auto px-2 py-2 border-b border-slate-200 custom-scrollbar bg-slate-100 shrink-0">
                {files.map(f => (
                    <div 
                        key={f.id} 
                        onClick={() => setActiveFileId(f.id)}
                        className={`
                            px-3 py-1.5 rounded-md flex items-center gap-2 cursor-pointer transition-all shrink-0 border select-none
                            ${activeFileId === f.id 
                                ? 'bg-white border-slate-200 text-primary-700 shadow-sm font-bold' 
                                : 'bg-transparent border-transparent text-slate-500 hover:bg-white hover:text-slate-700'
                            }
                        `}
                    >
                        <span className="text-[10px] truncate max-w-[120px]">{f.name}</span>
                        <button onClick={(e) => removeFile(e, f.id)} className="hover:text-red-500 opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
                    </div>
                ))}
            </div>

            <textarea 
              className="flex-1 bg-transparent p-5 text-[12px] font-mono text-slate-600 resize-none focus:outline-none custom-scrollbar whitespace-pre-wrap leading-relaxed" 
              value={files.find(f => f.id === activeFileId)?.content || ''} 
              onChange={(e) => {
                const val = e.target.value;
                setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: val } : f));
              }}
              placeholder="Paste text here or import a file..."
              spellCheck={false}
            />
          </div>

          {/* Output Panel */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <div className="bg-white px-4 py-2.5 flex justify-between items-center border-b border-slate-200 shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Processed Output</span>
              <div className="flex gap-2">
                {currentOutput() && (
                   <>
                    <button onClick={() => downloadFile('Result.txt', currentOutput())} className="text-[10px] font-bold text-primary-600 hover:text-primary-800 transition-colors">Download</button>
                   </>
                )}
              </div>
            </div>
            <textarea 
               className="flex-1 bg-transparent p-5 text-[12px] font-mono text-slate-800 resize-none focus:outline-none custom-scrollbar whitespace-pre-wrap leading-relaxed" 
               value={currentOutput()} 
               readOnly 
               placeholder="Results will appear here..." 
               spellCheck={false}
            />
          </div>
        </div>

        {/* Progress Bar */}
        {status === 'processing' && (
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col gap-2 max-w-xl mx-auto w-full shadow-2xl absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
            <div className="flex justify-between items-center">
                 <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{progress.currentFileName}</span>
                 <span className="text-[10px] font-mono text-slate-500">{Math.round((progress.blocksSent / (progress.blocksTotal || 1)) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200"><div className="h-full bg-primary-600 shadow-[0_0_10px_#7c3aed] transition-all duration-300 ease-out" style={{ width: `${(progress.blocksSent / (progress.blocksTotal || 1)) * 100}%` }}></div></div>
          </div>
        )}
      </main>

      {/* Language Modal */}
      {isLangModalOpen && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white">
              <h2 className="text-lg font-bold text-slate-900">Target Scripts</h2>
              <button onClick={() => setIsLangModalOpen(false)}><XCircle className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 grid grid-cols-4 gap-3 overflow-y-auto max-h-[60vh] custom-scrollbar bg-slate-50">
              {LANGUAGES.map(l => (
                <button key={l.value} onClick={() => setSelectedLangs(p => {
                    if (p.includes(l.value)) {
                        if (p.length === 1) return p; // Prevent deselecting last language
                        return p.filter(v => v !== l.value);
                    }
                    return [...p, l.value];
                })} 
                  className={`
                    p-3 rounded-lg border text-[11px] font-bold uppercase transition-all
                    ${selectedLangs.includes(l.value) 
                        ? 'bg-primary-600 border-primary-500 text-white shadow-md' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }
                  `}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end bg-white">
              <Button onClick={() => setIsLangModalOpen(false)} size="lg" variant="primary">Apply Selection</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

/**
 * MODULE 2: RESOURCE LOCALIZER (Code Based)
 */
const ResourcesModule = React.forwardRef(({ customApiKey, addLog }: { customApiKey: string, addLog: (m: string, msg: string) => void }, ref) => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [resourceType, setResourceType] = useState<'code' | 'text'>('code'); 
  const [sourceLang, setSourceLang] = useState<SourceLanguage>(SourceLanguage.ENGLISH);
  const [targetLang, setTargetLang] = useState<TargetLanguage>(TargetLanguage.Spanish);
  const [customLang, setCustomLang] = useState('');
  const [result, setResult] = useState<ResourceTranslationResult | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [progress, setProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });
  const stopProcessingRef = useRef(false);

  // Expose load method
  React.useImperativeHandle(ref, () => ({
    loadFile: (file: StoredFile) => {
      if (typeof file.content !== 'string') throw new Error("File content must be string");
      setResult({ originalFileName: file.name, originalContent: file.content as string, translatedContent: '' });
      addLog('RES', `Loaded file from workspace: ${file.name}`);
      setStatus(AppStatus.IDLE);
      setError(null);
    }
  }));

  const handleFileSelect = useCallback(async (content: string, fileName: string) => {
    setResult({ originalFileName: fileName, originalContent: content, translatedContent: '' });
    addLog('RES', `Loaded file: ${fileName}`);
    setStatus(AppStatus.IDLE);
    setError(null);
    setProgress({ current: 0, total: 0 });

    // Auto Save Source
    try {
        await workspaceService.saveFile({
            id: Math.random().toString(36).substr(2, 9),
            name: fileName,
            content,
            type: 'source',
            mimeType: 'text/plain',
            size: new Blob([content]).size,
            createdAt: new Date(),
            module: 'resources'
        });
    } catch (e: any) {
        addLog('ERR', `Workspace Save Failed (source): ${e.message}`);
    }
  }, [addLog]);

  const handleStop = () => {
      stopProcessingRef.current = true;
  }

  const handleTranslate = async () => {
    if (!result?.originalContent) return;
    stopProcessingRef.current = false;
    setStatus(AppStatus.TRANSLATING);
    setError(null);
    setProgress({ current: 0, total: 0 });
    
    const effectiveLang = targetLang === TargetLanguage.Other ? customLang : targetLang;
    if (!effectiveLang) {
        setError({ message: "Please select or enter a target language." });
        setStatus(AppStatus.IDLE);
        return;
    }

    addLog('RES', `Starting translation of ${result.originalFileName} to ${effectiveLang} (${resourceType})`);

    try {
      const gemini = new GeminiService(customApiKey);
      let translated = '';

      if (resourceType === 'code') {
        translated = await gemini.translateResourceFile(result.originalContent, sourceLang, effectiveLang);
      } else {
        translated = await gemini.translateDotNetResource(
          result.originalContent, 
          effectiveLang,
          (current, total, msg) => {
              setProgress({ current, total });
              if (msg) addLog('RES', msg);
          },
          () => stopProcessingRef.current
        );
      }
      
      setResult(prev => prev ? { ...prev, translatedContent: translated } : null);
      setStatus(AppStatus.COMPLETED);
      addLog('RES', `Translation completed successfully.`);

      // Auto Save Result
      try {
          const nameParts = result.originalFileName.split('.');
          const ext = nameParts.pop();
          const newName = `${nameParts.join('.')}_${effectiveLang.toLowerCase()}.${ext}`;
          
          await workspaceService.saveFile({
              id: Math.random().toString(36).substr(2, 9),
              name: newName,
              content: translated,
              type: 'destination',
              mimeType: 'text/plain',
              size: new Blob([translated]).size,
              createdAt: new Date(),
              module: 'resources'
          });
      } catch (e: any) {
          addLog('ERR', `Workspace Save Failed (dest): ${e.message}`);
      }

    } catch (err: any) {
      if (err.message.includes('stopped')) {
        addLog('RES', 'Translation stopped by user.');
        setStatus(AppStatus.IDLE);
      } else {
        setError({ message: "Translation Failed", details: err.message });
        setStatus(AppStatus.ERROR);
        addLog('RES', `Error: ${err.message}`);
        alert(`Resource Translation Failed: ${err.message}`);
      }
    }
  };

  const handleDownload = () => {
    if (!result?.translatedContent) return;
    const blob = new Blob(['\uFEFF' + result.translatedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nameParts = result.originalFileName.split('.');
    const ext = nameParts.pop();
    const effectiveLang = targetLang === TargetLanguage.Other ? customLang : targetLang;
    a.download = `${nameParts.join('.')}_${effectiveLang.toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('RES', `Downloaded file.`);
  };

  return (
    <main className="flex-1 flex flex-col p-8 gap-6 overflow-hidden relative bg-white">
      {!result ? (
        <div className="max-w-xl mx-auto w-full flex flex-col gap-8 items-center justify-center h-full">
           <div className="text-center space-y-3">
             <div className="bg-white p-4 rounded-2xl inline-block text-slate-800 border border-slate-200 shadow-md"><Code className="w-8 h-8 text-primary-600" /></div>
             <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Resource Localizer</h2>
             <p className="text-slate-500 font-medium text-sm">Translate JS, TS, JSON, and .NET Resource files</p>
           </div>
           
           <div className="flex gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button 
                onClick={() => setResourceType('code')} 
                className={`px-5 py-2 rounded-md text-[11px] font-bold transition-all ${resourceType === 'code' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
              >
                LeoStar App
              </button>
              <button 
                onClick={() => setResourceType('text')} 
                className={`px-5 py-2 rounded-md text-[11px] font-bold transition-all ${resourceType === 'text' ? 'bg-primary-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Windows LeoStar
              </button>
           </div>

           <FileUpload onFileSelect={handleFileSelect} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-6">
               <div className="flex flex-col gap-1">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target</span>
                 <div className="flex gap-2">
                    <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value as TargetLanguage)}
                        className="bg-white border border-slate-200 rounded-md px-3 py-1.5 text-[11px] font-bold text-slate-800 focus:border-primary-500 outline-none"
                    >
                        {Object.values(TargetLanguage).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    {targetLang === TargetLanguage.Other && (
                        <input 
                            type="text" 
                            className="bg-white border border-slate-200 rounded-md px-3 py-1.5 text-[11px] text-slate-800 w-32 focus:border-primary-500 outline-none"
                            placeholder="Type Language..."
                            value={customLang}
                            onChange={(e) => setCustomLang(e.target.value)}
                        />
                    )}
                 </div>
               </div>
               <div className="h-8 w-px bg-slate-200"></div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">File</span>
                 <span className="text-[11px] font-bold text-slate-700">{result.originalFileName}</span>
               </div>
            </div>
            <div className="flex gap-3">
               <Button variant="ghost" onClick={() => setResult(null)}>Change File</Button>
               {status === AppStatus.COMPLETED ? (
                 <div className="flex gap-2">
                   <Button variant="primary" onClick={handleDownload}><Download className="w-3.5 h-3.5 mr-2" /> Download</Button>
                 </div>
               ) : (
                 status === AppStatus.TRANSLATING ? (
                   <Button variant="destructive" onClick={handleStop}>
                     STOP
                   </Button>
                 ) : (
                    <Button variant="primary" onClick={handleTranslate}>
                     Translate
                   </Button>
                 )
               )}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-4 h-full min-h-0">
            <CodeBlock title="Original" code={result.originalContent} />
            {status === AppStatus.TRANSLATING ? (
              <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed flex items-center justify-center relative overflow-hidden">
                 <div className="text-center space-y-4 z-10 p-8">
                   <div className="relative mx-auto w-10 h-10">
                     <RefreshCw className="w-10 h-10 text-slate-300 animate-spin absolute top-0 left-0" />
                     <RefreshCw className="w-10 h-10 text-primary-600 animate-spin absolute top-0 left-0 opacity-100" />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[12px] font-bold text-slate-600 tracking-wide block">Translating...</span>
                     {resourceType === 'text' && progress.total > 0 && (
                       <span className="text-[10px] font-mono text-slate-400 block">{progress.current} / {progress.total}</span>
                     )}
                   </div>
                 </div>
                 {resourceType === 'text' && progress.total > 0 && (
                    <div className="absolute bottom-0 left-0 h-1 bg-primary-600 transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                 )}
              </div>
            ) : (
              <CodeBlock title={`Target: ${targetLang}`} code={result.translatedContent || ""} />
            )}
          </div>
        </div>
      )}
    </main>
  );
});

/**
 * MODULE 3: DATABASE LOCALIZER (direct SQLite handling)
 */
const DatabaseModule = React.forwardRef(({ customApiKey, addLog }: { customApiKey: string, addLog: (m: string, msg: string) => void }, ref) => {
  const [db, setDb] = useState<any>(null); // Source DB
  const [dbBuffer, setDbBuffer] = useState<Uint8Array | null>(null);
  
  // Target DB State
  const [targetDb, setTargetDb] = useState<any>(null);
  const [targetDbBuffer, setTargetDbBuffer] = useState<Uint8Array | null>(null);
  const [targetFileName, setTargetFileName] = useState<string>('');
  
  const [tasks, setTasks] = useState<DatabaseTask[]>([]);
  const [selectedTaskIndices, setSelectedTaskIndices] = useState<number[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'done' | 'error' | 'stopped'>('idle');
  const [mode, setMode] = useState<'translate' | 'rewrite'>('translate');
  const [targetLang, setTargetLang] = useState<TargetLanguage>(TargetLanguage.Hindi);
  const [customLang, setCustomLang] = useState('');
  const [progress, setProgress] = useState({ currentTable: '', rowsProcessed: 0, rowsTotal: 0 });
  const [fileName, setFileName] = useState(''); 
  const [searchTerm, setSearchTerm] = useState('');
  const stopProcessingRef = useRef(false);
  const detailedLogs = useRef<string[]>([]); // Detailed Log Buffer

  useEffect(() => {
    // @ts-ignore
    if (window.initSqlJs) {
      // @ts-ignore
      window.initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}` });
    }
  }, []);

  const loadDatabase = async (buffer: Uint8Array, name: string, isTarget: boolean = false) => {
    addLog('DB', `Loading ${isTarget ? 'Target' : 'Source'} database: ${name}`);
    
    // @ts-ignore
    const SQL = await window.initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}` });
    const database = new SQL.Database(buffer);

    if (isTarget) {
        setTargetFileName(name);
        setTargetDbBuffer(buffer);
        setTargetDb(database);
        addLog('DB', `Target database loaded. Matching tables will be overwritten.`);
        return;
    }

    setFileName(name);
    setStatus('loading');
    setDbBuffer(buffer);
    setDb(database);

    const tablesRes = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (tablesRes.length > 0) {
      const allTables = tablesRes[0].values.map(v => v[0] as string);
      const tasksList: DatabaseTask[] = [];

      allTables.forEach(table => {
        const columnsRes = database.exec(`PRAGMA table_info("${table}")`);
        const columns = columnsRes[0].values.map(v => v[1] as string);
        const rowCountRes = database.exec(`SELECT COUNT(*) FROM "${table}"`);
        const rowCount = rowCountRes[0].values[0][0] as number;
        // FIX: Find the actual column name case-insensitively
        const sexColName = columns.find(c => c.toLowerCase() === 'sex');
        const hasSexCol = !!sexColName;

        const textCandidates = ['text', 'prediction', 'question', 'category', 'header', 'text1', 'text2', 'text3', 'text4', 'text5', 'text6', 'text7', 'text8'];
        let detectedCols: string[] = [];
        
        if (table.toLowerCase().endsWith("_header")) {
          detectedCols = columns.filter(c => ['text', 'text1', 'text2', 'notes'].includes(c.toLowerCase()));
        } else {
          detectedCols = columns.filter(c => textCandidates.includes(c.toLowerCase()));
        }

        if (detectedCols.length > 0) {
          tasksList.push({ table, columns: detectedCols, rowCount, hasSexCol, sexColName });
          addLog('DB', `Detected Table: ${table} (${rowCount} rows)`);
        }
      });
      setTasks(tasksList);
      setSelectedTaskIndices(tasksList.map((_, i) => i)); 
      setStatus('idle');
    }
  };

  // Expose load method
  React.useImperativeHandle(ref, () => ({
    loadFile: (file: StoredFile) => {
       if (file.content instanceof Uint8Array) {
         loadDatabase(file.content, file.name);
       } else {
         throw new Error("Database file must be binary (Uint8Array)");
       }
    }
  }));

  const handleDbUpload = async (e: React.ChangeEvent<HTMLInputElement>, isTarget: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = new Uint8Array(await file.arrayBuffer());
    await loadDatabase(buffer, file.name, isTarget);
    
    // Auto Save Source DB (Only source is auto-saved on import)
    if (!isTarget) {
        try {
            await workspaceService.saveFile({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            content: buffer,
            type: 'source',
            mimeType: 'application/x-sqlite3',
            size: buffer.length,
            createdAt: new Date(),
            module: 'database'
            });
        } catch(e: any) {
            addLog('ERR', `Workspace Save Failed (source DB): ${e.message}`);
        }
    }
  };

  const handleStop = () => {
    stopProcessingRef.current = true;
    setStatus('stopped');
    addLog('DB', "Process interruption requested...");
  };

  const downloadDetailedLog = async () => {
    if (detailedLogs.current.length === 0) return;
    const content = detailedLogs.current.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const logName = `Detailed_Database_Report_${new Date().getTime()}.txt`;
    a.download = logName;
    a.click();
    URL.revokeObjectURL(url);
    addLog('DB', 'Detailed report downloaded.');

    // Auto Save Log
    try {
        await workspaceService.saveFile({
          id: Math.random().toString(36).substr(2, 9),
          name: logName,
          content: content,
          type: 'log',
          mimeType: 'text/plain',
          size: blob.size,
          createdAt: new Date(),
          module: 'database'
        });
    } catch(e: any) {
        addLog('ERR', `Workspace Save Failed (log): ${e.message}`);
    }
  };

  const handleStartProcessing = async () => {
    if (!db || selectedTaskIndices.length === 0) return;
    stopProcessingRef.current = false;
    setStatus('processing');
    detailedLogs.current = [`--- DETAILED DATABASE PROCESSING LOG ---`, `Start Time: ${new Date().toISOString()}`, ''];
    
    const effectiveLang = targetLang === TargetLanguage.Other ? customLang : targetLang;

    if (!effectiveLang) {
        addLog('DB', "Error: Target language not specified.");
        setStatus('idle');
        return;
    }

    const gemini = new GeminiService(customApiKey);
    const BATCH_SIZE = 12;
    const CONCURRENCY = 50;

    try {
      const filteredTasks = tasks.filter(t => t.table.toLowerCase().includes(searchTerm.toLowerCase()));
      const selectedTasks = filteredTasks.filter((_, i) => selectedTaskIndices.includes(i));
      
      for (const task of selectedTasks) {
        if (stopProcessingRef.current) break;

        setProgress(p => ({ ...p, currentTable: task.table, rowsTotal: task.rowCount, rowsProcessed: 0 }));
        addLog('DB', `Processing table: ${task.table}`);
        detailedLogs.current.push(`\n=== Processing Table: ${task.table} ===`);

        const allColsRes = db.exec(`PRAGMA table_info("${task.table}")`);
        const allColNames = allColsRes[0].values.map((v: any) => v[1]);
        const allColStr = allColNames.map((c: string) => `"${c}"`).join(', ');

        // --- TARGET DB HANDLING ---
        if (targetDb) {
           const sqlRes = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${task.table}'`);
           if (sqlRes.length > 0 && sqlRes[0].values.length > 0) {
               const createSql = sqlRes[0].values[0][0] as string;
               try {
                  targetDb.run(`DROP TABLE IF EXISTS "${task.table}"`);
                  targetDb.run(createSql);
                  addLog('DB', `Recreated table '${task.table}' in target database.`);
               } catch (e) {
                  addLog('DB', `Error preparing target table: ${(e as any).message}`);
                  continue;
               }
           } else {
               addLog('DB', `Could not find schema for table '${task.table}', skipping.`);
               continue;
           }
        }
        // --------------------------

        const isHeaderTable = task.table.toLowerCase().endsWith("_header");
        let whereClause = "";
        
        if (isHeaderTable) {
           const conditions = allColNames.map((col: string) => 
               `"${col}" LIKE 'Heading%' OR "${col}" LIKE 'Notes%'`
           ).join(' OR ');
           
           if (conditions) {
             whereClause = `WHERE ${conditions}`;
           }
        }
        
        let effectiveRowCount = task.rowCount;
        if (whereClause) {
           try {
             const countRes = db.exec(`SELECT COUNT(*) FROM "${task.table}" ${whereClause}`);
             effectiveRowCount = countRes[0].values[0][0] as number;
           } catch (e) {
             addLog('DB', `Warning: Could not count rows with WHERE clause for ${task.table}.`);
           }
        }
        setProgress(p => ({ ...p, rowsTotal: effectiveRowCount }));

        if (effectiveRowCount === 0) continue;

        // Prepare Task Units (Offsets) for Parallel Processing
        const offsets: number[] = [];
        for (let offset = 0; offset < effectiveRowCount; offset += BATCH_SIZE) {
          offsets.push(offset);
        }

        // Execute Parallel Queue
        await processBatchQueue(
          offsets,
          1, // Each item in 'offsets' is already a batch unit
          CONCURRENCY,
          async (offsetBatch) => {
            const offset = offsetBatch[0]; // Batch size 1, so take first element
            if (stopProcessingRef.current) return;

            const query = `SELECT rowid, ${allColStr} FROM "${task.table}" ${whereClause} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
            
            let rowsRes;
            try {
               rowsRes = db.exec(query);
            } catch(e) {
               console.error(`DB Query Error`, e);
               return;
            }

            if (rowsRes.length > 0) {
              const batchItems = rowsRes[0].values.map((v: any) => {
                const rowid = v[0] as number;
                const fullRowData: Record<string, any> = {};
                allColNames.forEach((col: string, i: number) => fullRowData[col] = v[i + 1]);
                const translatableData: Record<string, any> = {};
                task.columns.forEach(col => translatableData[col] = fullRowData[col]);
                
                if (task.sexColName && typeof fullRowData[task.sexColName] !== 'undefined') {
                     translatableData['sex'] = fullRowData[task.sexColName];
                }
                
                // Logging logic moved outside worker to keep clean or simplified inside
                return { rowid, data: translatableData }; 
              });

              // Process with AI
              const results = await gemini.translateDatabaseBatch(batchItems, effectiveLang, mode);

              // Write Logic (Synchronous SQLite write is safe in JS single thread loop)
              results.forEach((res, idx) => {
                const translatedFields = res.translatedData;
                
                if (targetDb) {
                    const originalRow = rowsRes[0].values[idx];
                    const finalRowData: any = {};
                    allColNames.forEach((col: string, i: number) => {
                        finalRowData[col] = originalRow[i+1];
                    });
                    Object.keys(translatedFields).forEach(key => {
                        finalRowData[key] = translatedFields[key];
                    });
                    const cols = Object.keys(finalRowData).map(c => `"${c}"`).join(',');
                    const placeholders = Object.keys(finalRowData).map(() => '?').join(',');
                    const values = Object.values(finalRowData);
                    try {
                      targetDb.run(`INSERT INTO "${task.table}" (${cols}) VALUES (${placeholders})`, values);
                    } catch(e) {}
                    
                } else {
                    const updateParts = Object.keys(translatedFields)
                      .map(col => `"${col}" = ?`)
                      .join(', ');
                    const updateVals = Object.values(translatedFields);
                    updateVals.push(res.rowid);
                    db.run(`UPDATE "${task.table}" SET ${updateParts} WHERE rowid = ?`, updateVals);
                }
                
                // Detailed logging
                Object.keys(translatedFields).forEach(col => {
                   detailedLogs.current.push(`[WRITE] [Row:${res.rowid}] [Col:${col}] "${String(translatedFields[col]).substring(0, 50)}..."`);
                });
              });
            }
          },
          (processedCount) => {
             // We track processed rows differently here since batches vary
             // Simple approximation for progress bar:
             setProgress(p => ({ ...p, rowsProcessed: Math.min(p.rowsProcessed + BATCH_SIZE, effectiveRowCount) }));
          },
          () => stopProcessingRef.current
        );

        addLog('DB', `Finished table: ${task.table}`);
      }
      
      detailedLogs.current.push(`\nEnd Time: ${new Date().toISOString()}`);
      downloadDetailedLog();

      if (stopProcessingRef.current) {
          setStatus('stopped');
          addLog('DB', 'Processing stopped.');
      } else {
          setStatus('done');
          addLog('DB', 'Processing complete! Detailed log downloaded.');
          
          const dbToExport = targetDb || db;
          const resultBuffer = dbToExport.export();
          try {
            await workspaceService.saveFile({
                id: Math.random().toString(36).substr(2, 9),
                name: (targetDb ? targetFileName : fileName).replace('.db', '') + `_${mode}_${effectiveLang}.db`,
                content: resultBuffer,
                type: 'destination',
                mimeType: 'application/x-sqlite3',
                size: resultBuffer.length,
                createdAt: new Date(),
                module: 'database'
            });
          } catch(e: any) {
             addLog('ERR', `Workspace Save Failed (dest DB): ${e.message}`);
          }
      }

    } catch (err: any) {
         addLog('DB', `Critical Error: ${err.message}`);
         setStatus('error');
    }
  };

  const handleDownload = () => {
    const dbToExport = targetDb || db;
    if (!dbToExport) return;
    const binaryArray = dbToExport.export();
    const blob = new Blob([binaryArray], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (targetDb ? targetFileName : fileName).replace('.db', '') + `_${mode}_${targetLang}.db`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleTask = (idx: number) => {
    setSelectedTaskIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const filteredTasks = tasks.filter(t => t.table.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <main className="flex-1 flex flex-col p-8 gap-6 overflow-hidden relative bg-white">
      {!dbBuffer ? (
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-8 items-center justify-center h-full">
          <div className="text-center space-y-3">
             <div className="bg-white p-4 rounded-2xl inline-block text-slate-800 border border-slate-200 shadow-md"><Database className="w-8 h-8 text-primary-600" /></div>
             <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Database Localizer</h2>
             <p className="text-slate-500 font-medium text-sm">Direct localization of SQLite (.db) files.</p>
          </div>
          <div className="w-full">
             <div className="relative">
                <input type="file" accept=".db,.sqlite" onChange={(e) => handleDbUpload(e, false)} className="hidden" id="db-upload" />
                <label htmlFor="db-upload" className="block border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl p-12 text-center cursor-pointer hover:border-primary-500 hover:bg-white transition-all group h-full flex flex-col items-center justify-center">
                  <Upload className="w-6 h-6 text-slate-400 mx-auto mb-3 group-hover:text-primary-600" />
                  <span className="text-sm font-bold text-slate-500 group-hover:text-slate-900">Upload Source .db</span>
                </label>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
           {/* Controls Card */}
           <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm shrink-0">
             <div className="flex items-center gap-6">
               <div className="flex flex-col gap-1.5">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Operation</span>
                 <div className="flex bg-slate-50 rounded-lg p-0.5 border border-slate-200">
                    <button onClick={() => setMode('translate')} className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${mode === 'translate' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Translate</button>
                    <button onClick={() => setMode('rewrite')} className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${mode === 'rewrite' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Rewrite</button>
                 </div>
               </div>
               
               <div className={`flex flex-col gap-1.5 ${mode === 'rewrite' ? 'opacity-30 pointer-events-none' : ''}`}>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target</span>
                  <div className="flex gap-2">
                      <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value as TargetLanguage)}
                        className="bg-white border border-slate-200 rounded-md px-3 py-1.5 text-[11px] font-bold text-slate-800 focus:border-primary-500 outline-none"
                      >
                        {Object.values(TargetLanguage).map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      {targetLang === TargetLanguage.Other && (
                          <input 
                              type="text" 
                              className="bg-white border border-slate-200 rounded-md px-3 py-1.5 text-[11px] text-slate-800 w-32 focus:border-primary-500 outline-none"
                              placeholder="Language..."
                              value={customLang}
                              onChange={(e) => setCustomLang(e.target.value)}
                          />
                      )}
                  </div>
               </div>

               <div className="h-8 w-px bg-slate-200"></div>

               <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-10">Src</span>
                    <span className="text-[11px] font-bold text-slate-700 truncate max-w-[150px]">{fileName}</span>
                  </div>
                  {targetDb && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-primary-600 uppercase tracking-widest w-10">Dst</span>
                        <span className="text-[11px] font-bold text-primary-600 truncate max-w-[150px]">{targetFileName}</span>
                      </div>
                  )}
               </div>
               
               {/* TARGET DB UPLOAD BUTTON */}
               {!targetDb && (
                   <div className="relative">
                        <input type="file" accept=".db,.sqlite" onChange={(e) => handleDbUpload(e, true)} className="hidden" id="target-db-upload" />
                        <label htmlFor="target-db-upload" className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-dashed border-slate-300 rounded-lg hover:border-primary-400 hover:bg-white cursor-pointer transition-all">
                            <PlusCircle className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-500">Add Target DB (Optional)</span>
                        </label>
                   </div>
               )}
             </div>

             <div className="flex gap-3 ml-auto">
               <Button variant="ghost" onClick={() => { setDb(null); setDbBuffer(null); setTargetDb(null); setTargetDbBuffer(null); }}>Reset</Button>
               {status === 'done' || status === 'stopped' ? (
                 <div className="flex gap-2">
                   <Button variant="primary" onClick={handleDownload}>
                     <Download className="w-3.5 h-3.5 mr-2" /> Download
                   </Button>
                 </div>
               ) : (
                 status === 'processing' ? (
                    <Button variant="destructive" onClick={handleStop}>
                     STOP BATCH
                   </Button>
                 ) : (
                    <Button 
                        variant="primary"
                        onClick={handleStartProcessing}
                        disabled={selectedTaskIndices.length === 0}
                    >
                        {`Start Batch ${mode.toUpperCase()}`}
                    </Button>
                 )
               )}
             </div>
           </div>

           <div className="flex-1 grid grid-cols-3 gap-6 overflow-hidden">
              <div className="col-span-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                 <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><List className="w-3 h-3"/> Tables</span>
                      <button 
                        onClick={() => setSelectedTaskIndices(selectedTaskIndices.length === filteredTasks.length ? [] : filteredTasks.map((_, i) => i))}
                        className="text-[10px] font-bold text-primary-600 hover:text-primary-800 transition-colors uppercase"
                      >
                        {selectedTaskIndices.length === filteredTasks.length && filteredTasks.length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1.5 gap-2 focus-within:border-slate-400 transition-colors">
                       <Search className="w-3.5 h-3.5 text-slate-400" />
                       <input 
                          type="text" 
                          placeholder="Filter tables..." 
                          className="bg-transparent border-none text-[11px] text-slate-600 placeholder-slate-400 focus:outline-none w-full"
                          value={searchTerm}
                          onFocus={() => setSelectedTaskIndices([])} 
                          onChange={(e) => setSearchTerm(e.target.value)}
                       />
                    </div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {filteredTasks.length === 0 ? (
                      <div className="text-center text-slate-400 text-[10px] py-4">No tables found</div>
                    ) : (
                      filteredTasks.map((task, idx) => {
                        const isSelected = selectedTaskIndices.includes(idx);
                        const isHeaderTable = task.table.toLowerCase().endsWith("_header");
                        return (
                          <div 
                            key={task.table} 
                            onClick={() => toggleTask(idx)}
                            className={`
                              cursor-pointer border p-3 rounded-lg flex flex-col gap-2 transition-all duration-200
                              ${isSelected 
                                ? 'bg-slate-50 border-primary-200 shadow-sm' 
                                : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                              }
                            `}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                     <span className={`text-[11px] font-bold uppercase truncate max-w-[150px] ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{task.table}</span>
                                     {isHeaderTable && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${isSelected ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-400'}`}>Header</span>}
                                  </div>
                                  <span className={`text-[10px] font-mono tracking-tight ${isSelected ? 'text-slate-600' : 'text-slate-400'}`}>{task.rowCount} Rows</span>
                              </div>
                              <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${isSelected ? 'bg-primary-600 border-primary-600' : 'border-slate-200'}`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                 </div>
              </div>

              <div className="col-span-2 flex flex-col gap-4 overflow-hidden relative">
                 <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <Database className="w-12 h-12 text-slate-300" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-600">No Task Active</h3>
                      <p className="text-[11px] text-slate-400">Select tables from the left list to begin translation or rewriting.</p>
                    </div>
                 </div>
                 {status === 'processing' && (
                   <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex items-center justify-center p-8">
                     <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-xl w-full max-w-lg">
                        <div className="flex justify-between items-center">
                           <div className="flex items-center gap-3">
                             <RefreshCw className="w-5 h-5 text-primary-600 animate-spin" />
                             <div className="flex flex-col">
                                <span className="text-[12px] font-bold text-slate-800 uppercase tracking-wider">{progress.currentTable}</span>
                                <span className="text-[10px] text-slate-500">Processing records...</span>
                             </div>
                           </div>
                           <div className="text-right">
                              <span className="text-[12px] font-mono text-slate-600">{progress.rowsProcessed} / {progress.rowsTotal}</span>
                           </div>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-600 transition-all duration-300 shadow-sm" style={{ width: `${(progress.rowsProcessed / (progress.rowsTotal || 1)) * 100}%` }}></div>
                        </div>
                     </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </main>
  );
});
