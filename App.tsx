
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, Download, Languages, Split, Sparkles, Wand2, XCircle, 
  CheckCircle2, RefreshCw, Check, Scroll, BookOpen, Info, HelpCircle, 
  FileText, ChevronRight, Settings2, ChevronDown, ChevronUp, AlertCircle, FileCode, Code, Database, Search, Filter, List, FolderOpen, Trash2, Save, File, HardDrive, ArrowRightLeft, Key, Terminal, DownloadCloud, LayoutTemplate
} from 'lucide-react';
import { LANGUAGES } from './constants';
import { 
  TargetLanguage, ProcessingMode, ProcessingItem, BatchResponse, 
  AppStatus, SourceLanguage, ResourceTranslationResult, ProcessingError, DatabaseTask, StoredFile 
} from './types';
import { GeminiService } from './services/geminiService';
import { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } from './utils/parser';
import { Button } from './components/Button';
import FileUpload from './components/FileUpload';
import CodeBlock from './components/CodeBlock';

type AppModule = 'predictions' | 'resources' | 'database' | 'workspace';

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

// Helper Components
interface ModeButtonProps {
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  colorClass: string;
  tooltip: string;
}

const ModeButton: React.FC<ModeButtonProps> = ({ isActive, onClick, icon, label, colorClass, tooltip }) => (
  <button 
    onClick={onClick}
    title={tooltip}
    className={`h-9 px-5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${isActive ? `${colorClass} border-transparent text-white shadow-lg` : 'bg-transparent border-gray-800 text-gray-500 hover:bg-gray-900'}`}
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
}

const OptionToggle: React.FC<OptionToggleProps> = ({ active, onClick, icon, label, tooltip }) => (
  <button 
    onClick={onClick}
    title={tooltip}
    className={`h-9 px-4 rounded-full text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${active ? 'bg-gray-800 border-gray-600 text-white' : 'bg-transparent border-transparent text-gray-600 hover:text-gray-400'}`}
  >
    {icon} {label}
  </button>
);

const TerminalWindow = ({ logs }: { logs: LogEntry[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-32 bg-black border-t border-gray-800 flex flex-col font-mono text-[10px] shrink-0">
      <div className="px-4 py-1 bg-gray-900 border-b border-gray-800 flex items-center gap-2 text-gray-500 font-bold uppercase tracking-widest">
        <Terminal className="w-3 h-3" /> System Terminal
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
        {logs.length === 0 ? (
          <div className="text-gray-700 italic">Ready...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-gray-600">[{log.timestamp}]</span>
              <span className={`font-bold ${log.module === 'DB' ? 'text-pink-600' : log.module === 'RES' ? 'text-blue-600' : 'text-indigo-600'}`}>[{log.module}]</span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('predictions');
  const [workspaceFiles, setWorkspaceFiles] = useState<StoredFile[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((module: string, message: string) => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), module, message }]);
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setIsSettingsOpen(false);
  };

  const addToWorkspace = (file: Omit<StoredFile, 'id' | 'createdAt'>) => {
    const newFile: StoredFile = {
      ...file,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date()
    };
    setWorkspaceFiles(prev => [newFile, ...prev]);
    addLog('SYS', `Added file to workspace: ${file.name}`);
  };

  const removeFromWorkspace = (id: string) => {
    setWorkspaceFiles(prev => prev.filter(f => f.id !== id));
    addLog('SYS', `Removed file from workspace`);
  };

  return (
    <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
      {/* --- SHARED HEADER --- */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between shadow-2xl shrink-0 z-[100]">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-2xl shadow-lg shadow-indigo-900/40">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tighter uppercase">AI Translation & Correction</h1>
        </div>

        {/* --- MODULE SWITCHER --- */}
        <div className="bg-gray-950 p-1 rounded-full border border-gray-800 flex gap-1">
           <button 
             onClick={() => setActiveModule('predictions')}
             className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeModule === 'predictions' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
           >
             <FileText className="w-3.5 h-3.5" /> Predictions
           </button>
           <button 
             onClick={() => setActiveModule('resources')}
             className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeModule === 'resources' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
           >
             <Code className="w-3.5 h-3.5" /> Resources
           </button>
           <button 
             onClick={() => setActiveModule('database')}
             className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeModule === 'database' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
           >
             <Database className="w-3.5 h-3.5" /> Database
           </button>
           <div className="w-px h-6 bg-gray-800 mx-1 self-center"></div>
           <button 
             onClick={() => setActiveModule('workspace')}
             className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeModule === 'workspace' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
           >
             <FolderOpen className="w-3.5 h-3.5" /> Workspace <span className="bg-gray-800 px-1.5 rounded-full text-[9px]">{workspaceFiles.length}</span>
           </button>
        </div>

        <div className="flex items-center gap-3">
           <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors">
              <Settings2 className="w-5 h-5" />
           </button>
           <div className="text-[9px] text-indigo-400 font-black uppercase tracking-widest opacity-50 hidden sm:block">
             Powered by Gemini 3 Pro
           </div>
        </div>
      </header>

      {/* --- SETTINGS MODAL --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
           <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black text-white uppercase tracking-tighter">Settings</h2>
                 <button onClick={() => setIsSettingsOpen(false)}><XCircle className="w-6 h-6 text-gray-500 hover:text-white" /></button>
              </div>
              <div className="space-y-4">
                 <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Custom Gemini API Key</label>
                    <div className="flex items-center bg-black border border-gray-800 rounded-xl px-3 py-1">
                       <Key className="w-4 h-4 text-gray-600 mr-2" />
                       <input 
                         type="password" 
                         className="bg-transparent border-none text-white text-sm focus:outline-none flex-1 py-2"
                         placeholder="Paste your key here..."
                         defaultValue={apiKey}
                         onChange={(e) => setApiKey(e.target.value)}
                       />
                    </div>
                    <p className="text-[9px] text-gray-600 mt-2">Leave empty to use the default environment key. A custom key is stored in your browser's local storage.</p>
                 </div>
                 <div className="flex justify-end mt-6">
                    <Button onClick={() => saveApiKey(apiKey)} className="bg-indigo-600 rounded-full px-6">Save Settings</Button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- DYNAMIC MODULE CONTENT (PERSISTENT) --- */}
      
      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'predictions' ? 'flex' : 'hidden'}`}>
        <PredictionsModule onSaveToWorkspace={addToWorkspace} customApiKey={apiKey} addLog={addLog} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'resources' ? 'flex' : 'hidden'}`}>
        <ResourcesModule onSaveToWorkspace={addToWorkspace} customApiKey={apiKey} addLog={addLog} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'database' ? 'flex' : 'hidden'}`}>
        <DatabaseModule onSaveToWorkspace={addToWorkspace} files={workspaceFiles} customApiKey={apiKey} addLog={addLog} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'workspace' ? 'flex' : 'hidden'}`}>
        <WorkspaceModule files={workspaceFiles} onRemove={removeFromWorkspace} onAdd={addToWorkspace} />
      </div>

      <TerminalWindow logs={logs} />

      <footer className="bg-gray-900 border-t border-gray-800 p-2 shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-8">
           <div className="flex gap-6">
              <span className="text-[9px] font-black text-gray-500 uppercase">Leo Star Localizer Suite</span>
           </div>
           <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest">A Professional Astrology Localization Solution</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * MODULE 4: WORKSPACE MODULE (File Manager)
 */
function WorkspaceModule({ files, onRemove, onAdd }: { files: StoredFile[], onRemove: (id: string) => void, onAdd: (f: any) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result;
        if (content) {
          onAdd({
            name: file.name,
            type: 'source',
            content: typeof content === 'string' ? content : new Uint8Array(content as ArrayBuffer),
            mimeType: file.type || 'text/plain',
            size: file.size
          });
        }
      };
      if (file.name.endsWith('.db') || file.name.endsWith('.sqlite')) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleDownload = (file: StoredFile) => {
    let blob: Blob;
    if (file.content instanceof Uint8Array) {
      blob = new Blob([file.content], { type: 'application/x-sqlite3' });
    } else {
      blob = new Blob(['\uFEFF' + file.content], { type: 'text/plain;charset=utf-8' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex-1 flex flex-col p-8 gap-8 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <HardDrive className="w-6 h-6 text-indigo-500" /> Project Files
          </h2>
          <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest">Manage source and destination files for this session.</p>
        </div>
        <div className="flex gap-3">
          <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
          <Button onClick={() => fileInputRef.current?.click()} className="h-10 rounded-full px-6 text-[10px] font-black bg-indigo-600">
            <Upload className="w-3.5 h-3.5 mr-2" /> Upload to Workspace
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-gray-900/50 border border-gray-800 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl">
         <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-gray-900 border-b border-gray-800 text-[9px] font-black text-gray-500 uppercase tracking-widest">
            <div className="col-span-5">Filename</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-2">Date Added</div>
            <div className="col-span-1 text-right">Actions</div>
         </div>
         <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4">
                <FolderOpen className="w-12 h-12 opacity-20" />
                <span className="text-[10px] font-black uppercase">No files in workspace</span>
              </div>
            ) : (
              files.map(file => (
                <div key={file.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-800/50 rounded-2xl transition-colors group">
                   <div className="col-span-5 flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${file.name.endsWith('.db') ? 'bg-pink-500/10 text-pink-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {file.name.endsWith('.db') ? <Database className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <span className="text-[11px] font-bold text-gray-200 truncate">{file.name}</span>
                   </div>
                   <div className="col-span-2">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${file.type === 'source' ? 'bg-gray-800 text-gray-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                        {file.type}
                      </span>
                   </div>
                   <div className="col-span-2 text-[10px] font-mono text-gray-500">
                     {(file.size / 1024).toFixed(1)} KB
                   </div>
                   <div className="col-span-2 text-[10px] font-mono text-gray-500">
                     {file.createdAt.toLocaleTimeString()}
                   </div>
                   <div className="col-span-1 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(file)} className="p-1.5 hover:bg-gray-700 rounded-lg text-indigo-400 transition-colors" title="Download">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => onRemove(file.id)} className="p-1.5 hover:bg-gray-700 rounded-lg text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                   </div>
                </div>
              ))
            )}
         </div>
      </div>
    </main>
  );
}

/**
 * MODULE 1: PREDICTIONS TOOL (Block Based)
 */
function PredictionsModule({ onSaveToWorkspace, customApiKey, addLog }: { onSaveToWorkspace: (f: any) => void, customApiKey: string, addLog: (m: string, msg: string) => void }) {
  const [files, setFiles] = useState<FileData[]>([
    { name: 'Default_Example.txt', content: `FileHeader.txt\n\n#* Planet=0,Case=0\n##*Text\nYou have debilitated Jupiter in lagna which is under the influence of <PlanetInfluence>.\nAs a successful businessperson, you should recite Hanuman Chalisa daily.\n\n#* Planet=0,Case=1\n##*Text\nv©"kf/k ef.k  ea=k.kka]  xzg&u{k=  rkfjdk A\nÒkX;dkys ÒosfRlf)% vÒkX;a fu"Qya Òosr AA`, id: 'default' }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('default');
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  
  const [selectedLangs, setSelectedLangs] = useState<string[]>([TargetLanguage.Hindi]);
  const [customLangInput, setCustomLangInput] = useState('');
  const [mode, setMode] = useState<ProcessingMode>('translate');
  const [dualSexMode, setDualSexMode] = useState(false);
  const [autoDownload, setAutoDownload] = useState(true);
  const [shlokaMode, setShlokaMode] = useState(false);
  const [sanskritMode, setSanskritMode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'stopped' | 'error'>('idle');
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [progress, setProgress] = useState({ blocksSent: 0, blocksTotal: 0, currentFileName: '' });
  const stopProcessingRef = useRef(false);

  const handleSaveToWorkspace = () => {
    const content = currentOutput();
    if (!content) return;
    const activeFile = files.find(f => f.id === activeFileId);
    const activeLangs = mode === 'rewrite' ? ['Default'] : selectedLangs;
    const fileName = `${activeFile?.name || 'Result'}_${activeLangs[0]}.txt`;
    
    onSaveToWorkspace({
      name: fileName,
      type: 'destination',
      content: content,
      mimeType: 'text/plain',
      size: new Blob([content]).size
    });
  };

  const triggerDownload = (fileName: string, content: string) => {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleProcess = async () => {
    stopProcessingRef.current = false;
    setStatus('processing');
    setOutputs({});
    
    const activeLangs = mode === 'rewrite' ? ['Default'] : selectedLangs;
    const gemini = new GeminiService(customApiKey);

    for (let fIndex = 0; fIndex < files.length; fIndex++) {
      const currentFile = files[fIndex];
      addLog('PRED', `Processing file: ${currentFile.name}`);

      // Save source file to workspace
      onSaveToWorkspace({
        name: currentFile.name,
        type: 'source',
        content: currentFile.content,
        mimeType: 'text/plain',
        size: new Blob([currentFile.content]).size
      });

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
        
        const BATCH_SIZE = 10;
        for (let i = 0; i < totalItems; i += BATCH_SIZE) {
          if (stopProcessingRef.current) { setStatus('stopped'); return; }
          const batch = processingItems.slice(i, i + BATCH_SIZE);
          
          addLog('PRED', `Sending batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(totalItems/BATCH_SIZE)}`);
          
          const results: BatchResponse[] = await gemini.translateBatch(
            batch.map(item => ({ text: item.text, context: item.context })), 
            currentLang, 
            mode, 
            shlokaMode, 
            sanskritMode // Pass preserve sanskrit flag
          );
          batch.forEach((item, idx) => {
            const blockIdx = parseInt(item.blockId.substring(1));
            if (results[idx]) baseTargetBlocks[blockIdx].lines[item.lineIndex] = results[idx].text;
          });
          setProgress(prev => ({ ...prev, blocksSent: Math.min(i + BATCH_SIZE, totalItems) }));
        }

        let finalOutput = preamble.trimEnd() + '\n\n';
        baseTargetBlocks.forEach((block, idx) => {
          finalOutput += `${block.header}\n${block.lines.join('\n').trimEnd()}${idx < baseTargetBlocks.length - 1 ? '\n\n' : ''}`;
        });
        
        const outputKey = `${currentFile.id}_${currentLang}`;
        setOutputs(prev => ({ ...prev, [outputKey]: finalOutput }));
        addLog('PRED', `Completed ${currentLang} for ${currentFile.name}`);

        if (autoDownload) triggerDownload(`${currentFile.name}_${currentLang}.txt`, finalOutput);
        
        // Auto save to workspace
        onSaveToWorkspace({
          name: `${currentFile.name}_${currentLang}.txt`,
          type: 'destination',
          content: finalOutput,
          mimeType: 'text/plain',
          size: new Blob([finalOutput]).size
        });
      }
    }
    setStatus('done');
  };

  const currentOutput = () => {
    const file = files.find(f => f.id === activeFileId);
    if (!file) return '';
    const activeLangs = mode === 'rewrite' ? ['Default'] : selectedLangs;
    return outputs[`${file.id}_${activeLangs[0]}`] || '';
  };

  return (
    <>
      <div className="bg-gray-950 border-b border-gray-800 px-6 py-3 flex items-center justify-start gap-12 shadow-md shrink-0 z-[50]">
        <div className="flex gap-2">
          <ModeButton isActive={mode === 'translate'} onClick={() => setMode('translate')} icon={<Languages className="w-3.5 h-3.5"/>} label="Translate" colorClass="bg-indigo-600" tooltip="Localize astrology block files." />
          <ModeButton isActive={mode === 'rewrite'} onClick={() => setMode('rewrite')} icon={<RefreshCw className="w-3.5 h-3.5"/>} label="Rewrite" colorClass="bg-teal-600" tooltip="Fix grammar and decode KrutiDev." />
        </div>
        <div className={`flex flex-col gap-1.5 ${mode === 'rewrite' ? 'opacity-40 pointer-events-none' : ''}`}>
          <button onClick={() => setIsLangModalOpen(true)} className="bg-gray-900 px-5 h-9 rounded-full text-[9px] font-black border border-gray-800 text-indigo-400 flex items-center gap-2">
            <Languages className="w-3.5 h-3.5"/> {selectedLangs.length} Selected
          </button>
        </div>
        <div className="flex gap-3">
          <OptionToggle active={dualSexMode} onClick={() => setDualSexMode(!dualSexMode)} icon={<Split className="w-3.5 h-3.5"/>} label="Dual Sex" tooltip="Separate Sex=0 and Sex=1 output." />
          <OptionToggle active={shlokaMode} onClick={() => setShlokaMode(!shlokaMode)} icon={<Scroll className="w-3.5 h-3.5"/>} label="Translit" tooltip="Phonetic Mantras." />
          <OptionToggle active={sanskritMode} onClick={() => setSanskritMode(!sanskritMode)} icon={<BookOpen className="w-3.5 h-3.5"/>} label="Preserve Sanskrit" tooltip="Keep Shlokas in Devanagari." />
        </div>
        <div className="ml-auto flex gap-3">
          <button onClick={() => setAutoDownload(!autoDownload)} className={`h-9 px-4 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${autoDownload ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
            Auto Save: {autoDownload ? 'ON' : 'OFF'}
          </button>
          <Button className="h-9 px-8 rounded-full text-[10px] font-black bg-indigo-600" onClick={handleProcess}>START PROCESSING</Button>
        </div>
      </div>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        <div className="flex-1 grid grid-cols-2 gap-4 h-full">
          <div className="flex flex-col rounded-3xl border border-gray-800 bg-gray-900/20 overflow-hidden">
            <div className="bg-gray-900 px-6 py-2.5 flex justify-between items-center border-b border-gray-800 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Source Predictions
              <button onClick={() => document.getElementById('blockInput')?.click()} className="text-indigo-400">Import Files</button>
              <input id="blockInput" type="file" multiple className="hidden" onChange={(e) => {
                if (e.target.files) Array.from(e.target.files).forEach(f => {
                  const r = new FileReader(); 
                  r.onload = (ev) => {
                    const newId = Math.random().toString(36).substr(2, 9);
                    const content = ev.target?.result as string;
                    setFiles(p => [...p, { name: f.name, content: content, id: newId }]);
                    // Immediately switch view to the imported file
                    setActiveFileId(newId);
                  };
                  r.readAsText(f);
                });
              }} />
            </div>
            <textarea 
              className="flex-1 bg-transparent p-6 text-[13px] font-mono text-gray-400 resize-none focus:outline-none custom-scrollbar whitespace-pre-wrap" 
              value={files.find(f => f.id === activeFileId)?.content || ''} 
              onChange={(e) => {
                const val = e.target.value;
                setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: val } : f));
              }}
              placeholder="Paste text here or import a file..."
            />
          </div>
          <div className="flex flex-col rounded-3xl border border-gray-800 bg-black/40 overflow-hidden">
            <div className="bg-gray-900 px-6 py-2.5 flex justify-between items-center border-b border-gray-800 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Processed Blocks
              <div className="flex gap-2">
                {currentOutput() && <button onClick={handleSaveToWorkspace} className="text-gray-400 hover:text-white transition-colors" title="Save to Workspace"><Save className="w-3.5 h-3.5"/></button>}
                {currentOutput() && <button onClick={() => triggerDownload('Result.txt', currentOutput())} className="text-indigo-400">Download</button>}
              </div>
            </div>
            <textarea className="flex-1 bg-transparent p-6 text-[13px] font-mono text-indigo-100 resize-none focus:outline-none custom-scrollbar whitespace-pre-wrap" value={currentOutput()} readOnly placeholder="Process to see results..." />
          </div>
        </div>
        {status === 'processing' && (
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col gap-2 max-w-xl mx-auto w-full">
            <span className="text-[10px] font-black text-white uppercase tracking-widest">{progress.currentFileName} - {Math.round((progress.blocksSent / (progress.blocksTotal || 1)) * 100)}%</span>
            <div className="w-full bg-black h-2 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${(progress.blocksSent / (progress.blocksTotal || 1)) * 100}%` }}></div></div>
          </div>
        )}
      </main>

      {isLangModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
          <div className="bg-gray-900 border border-gray-800 rounded-[3rem] w-full max-w-3xl flex flex-col overflow-hidden">
            <div className="p-10 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Target Scripts</h2>
              <button onClick={() => setIsLangModalOpen(false)}><XCircle className="w-7 h-7 text-gray-600" /></button>
            </div>
            <div className="p-8 grid grid-cols-4 gap-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
              {LANGUAGES.map(l => (
                <button key={l.value} onClick={() => setSelectedLangs(p => p.includes(l.value) ? p.filter(v => v !== l.value) : [...p, l.value])} className={`p-4 rounded-3xl border text-[10px] font-black uppercase transition-all ${selectedLangs.includes(l.value) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black border-gray-800 text-gray-500'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            {selectedLangs.includes(TargetLanguage.Other) && (
                <div className="px-10 py-4 border-t border-gray-800 bg-gray-950">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Custom Language</label>
                   <input 
                     type="text" 
                     className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                     placeholder="Enter language name (e.g. French, German)"
                     value={customLangInput}
                     onChange={(e) => setCustomLangInput(e.target.value)}
                   />
                </div>
            )}
            <div className="p-10 border-t border-gray-800 flex justify-end">
              <Button onClick={() => setIsLangModalOpen(false)} className="bg-indigo-600 px-12 h-14 rounded-full font-black">CONFIRM</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * MODULE 2: RESOURCE LOCALIZER (Code Based)
 */
function ResourcesModule({ onSaveToWorkspace, customApiKey, addLog }: { onSaveToWorkspace: (f: any) => void, customApiKey: string, addLog: (m: string, msg: string) => void }) {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [resourceType, setResourceType] = useState<'code' | 'text'>('code'); // code = JS/JSON, text = DotNet/Res
  const [sourceLang, setSourceLang] = useState<SourceLanguage>(SourceLanguage.ENGLISH);
  const [targetLang, setTargetLang] = useState<TargetLanguage>(TargetLanguage.Spanish);
  const [customLang, setCustomLang] = useState('');
  const [result, setResult] = useState<ResourceTranslationResult | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [progress, setProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });

  const handleFileSelect = useCallback((content: string, fileName: string) => {
    setResult({ originalFileName: fileName, originalContent: content, translatedContent: '' });
    // Save source to workspace
    onSaveToWorkspace({
      name: fileName,
      type: 'source',
      content: content,
      mimeType: 'text/plain',
      size: new Blob([content]).size
    });
    setStatus(AppStatus.IDLE);
    setError(null);
    setProgress({ current: 0, total: 0 });
    addLog('RES', `Loaded file: ${fileName}`);
  }, [onSaveToWorkspace, addLog]);

  const handleTranslate = async () => {
    if (!result?.originalContent) return;
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
        // DotNet / Text Resource Mode
        translated = await gemini.translateDotNetResource(
          result.originalContent, 
          effectiveLang,
          (current, total, msg) => {
              setProgress({ current, total });
              if (msg) addLog('RES', msg);
          }
        );
      }
      
      setResult(prev => prev ? { ...prev, translatedContent: translated } : null);
      setStatus(AppStatus.COMPLETED);
      addLog('RES', `Translation completed successfully.`);
    } catch (err: any) {
      setError({ message: "Translation Failed", details: err.message });
      setStatus(AppStatus.ERROR);
      addLog('RES', `Error: ${err.message}`);
    }
  };

  const handleSaveResult = () => {
    if (!result?.translatedContent) return;
    const nameParts = result.originalFileName.split('.');
    const ext = nameParts.pop();
    const effectiveLang = targetLang === TargetLanguage.Other ? customLang : targetLang;
    const fileName = `${nameParts.join('.')}_${effectiveLang.toLowerCase()}.${ext}`;
    
    onSaveToWorkspace({
      name: fileName,
      type: 'destination',
      content: result.translatedContent,
      mimeType: 'text/plain',
      size: new Blob([result.translatedContent]).size
    });
    addLog('RES', `Saved result to workspace: ${fileName}`);
  };

  const handleDownload = () => {
    if (!result?.translatedContent) return;
    handleSaveResult(); // Auto save when downloading
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
    <main className="flex-1 flex flex-col p-8 gap-8 overflow-hidden">
      {!result ? (
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-6 items-center justify-center h-full">
           <div className="text-center space-y-4">
             <div className="bg-indigo-600/10 p-6 rounded-full inline-block text-indigo-500"><Code className="w-12 h-12" /></div>
             <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Resource Localizer</h2>
             <p className="text-gray-500 font-bold uppercase text-[11px] tracking-widest max-w-sm">Translate JS, TS, JSON, and .NET Resource files (Key=Value).</p>
           </div>
           
           <div className="flex gap-2 bg-gray-900 p-1 rounded-full border border-gray-800">
              <button 
                onClick={() => setResourceType('code')} 
                className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${resourceType === 'code' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Code (JS/TS/JSON)
              </button>
              <button 
                onClick={() => setResourceType('text')} 
                className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${resourceType === 'text' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Text Resource (.txt/.res)
              </button>
           </div>

           <FileUpload onFileSelect={handleFileSelect} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-[2.5rem] flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-6">
               <div className="flex flex-col gap-1">
                 <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Target Language</span>
                 <div className="flex gap-2">
                    <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value as TargetLanguage)}
                        className="bg-black border border-gray-800 rounded-full px-6 py-2 text-[11px] font-black text-indigo-400 focus:ring-2 focus:ring-indigo-600 outline-none"
                    >
                        {Object.values(TargetLanguage).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    {targetLang === TargetLanguage.Other && (
                        <input 
                            type="text" 
                            className="bg-black border border-gray-800 rounded-full px-4 py-2 text-[10px] text-white focus:outline-none focus:border-indigo-500 w-32"
                            placeholder="Type Language..."
                            value={customLang}
                            onChange={(e) => setCustomLang(e.target.value)}
                        />
                    )}
                 </div>
               </div>
               <div className="h-10 w-px bg-gray-800"></div>
               <div className="flex flex-col">
                 <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Active File</span>
                 <span className="text-[11px] font-black text-white uppercase">{result.originalFileName}</span>
               </div>
               <div className="h-10 w-px bg-gray-800"></div>
               <div className="flex flex-col">
                 <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Type</span>
                 <span className="text-[11px] font-black text-white uppercase">{resourceType === 'code' ? 'Source Code' : 'Text Resource'}</span>
               </div>
            </div>
            <div className="flex gap-3">
               <Button variant="outline" className="h-10 rounded-full px-6 text-[10px] font-black" onClick={() => setResult(null)}>Change File</Button>
               {status === AppStatus.COMPLETED ? (
                 <div className="flex gap-2">
                   <Button className="h-10 rounded-full px-6 text-[10px] font-black bg-gray-800 hover:bg-gray-700" onClick={handleSaveResult}><Save className="w-3.5 h-3.5 mr-2" /> Save to Workspace</Button>
                   <Button className="h-10 rounded-full px-8 text-[10px] font-black bg-emerald-600" onClick={handleDownload}><Download className="w-3.5 h-3.5 mr-2" /> Download Result</Button>
                 </div>
               ) : (
                 <Button 
                   className="h-10 rounded-full px-10 text-[10px] font-black bg-indigo-600" 
                   onClick={handleTranslate}
                   isLoading={status === AppStatus.TRANSLATING}
                 >
                   Translate Resource
                 </Button>
               )}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-6 h-full min-h-0">
            <CodeBlock title="Original Source Code" code={result.originalContent} />
            {status === AppStatus.TRANSLATING ? (
              <div className="bg-gray-900/50 rounded-2xl border border-gray-800 border-dashed flex items-center justify-center relative overflow-hidden">
                 <div className="text-center space-y-4 z-10 p-8">
                   <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
                   <div className="space-y-1">
                     <span className="text-[11px] font-black text-white uppercase tracking-widest block">Translating...</span>
                     {resourceType === 'text' && progress.total > 0 && (
                       <span className="text-[9px] font-mono text-gray-500 block">Processing line {progress.current} of {progress.total}</span>
                     )}
                   </div>
                 </div>
                 {resourceType === 'text' && progress.total > 0 && (
                    <div className="absolute bottom-0 left-0 h-1 bg-indigo-600 transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                 )}
              </div>
            ) : (
              <CodeBlock title={`Target Translation: ${targetLang}`} code={result.translatedContent || "// Results will appear here..."} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * MODULE 3: DATABASE LOCALIZER (direct SQLite handling)
 */
function DatabaseModule({ onSaveToWorkspace, files, customApiKey, addLog }: { onSaveToWorkspace: (f: any) => void, files: StoredFile[], customApiKey: string, addLog: (m: string, msg: string) => void }) {
  const [db, setDb] = useState<any>(null); // Source DB
  const [destDb, setDestDb] = useState<any>(null); // Optional Destination DB
  const [dbBuffer, setDbBuffer] = useState<Uint8Array | null>(null);
  const [tasks, setTasks] = useState<DatabaseTask[]>([]);
  const [selectedTaskIndices, setSelectedTaskIndices] = useState<number[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'done' | 'error'>('idle');
  const [mode, setMode] = useState<'translate' | 'rewrite'>('translate');
  const [targetLang, setTargetLang] = useState<TargetLanguage>(TargetLanguage.Hindi);
  const [customLang, setCustomLang] = useState('');
  const [progress, setProgress] = useState({ currentTable: '', rowsProcessed: 0, rowsTotal: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [fileName, setFileName] = useState(''); // Source File Name
  const [destFileName, setDestFileName] = useState(''); // Dest File Name
  const [searchTerm, setSearchTerm] = useState('');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [selectingFor, setSelectingFor] = useState<'source' | 'dest'>('source');

  const localAddLog = (msg: string) => {
      setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
      addLog('DB', msg);
  };

  useEffect(() => {
    // @ts-ignore
    if (window.initSqlJs) {
      // @ts-ignore
      window.initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}` });
    }
  }, []);

  const loadDatabase = async (buffer: Uint8Array, name: string, isDest: boolean = false) => {
    localAddLog(`Loading ${isDest ? 'Destination' : 'Source'} database: ${name}`);
    
    // @ts-ignore
    const SQL = await window.initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}` });
    const database = new SQL.Database(buffer);
    
    if (isDest) {
      setDestDb(database);
      setDestFileName(name);
      localAddLog("Destination database ready for merging.");
      return;
    }

    setFileName(name);
    setStatus('loading');
    setDbBuffer(buffer);
    setDb(database);

    // Identify tables and text columns (matching Python's logic)
    const tablesRes = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (tablesRes.length > 0) {
      const allTables = tablesRes[0].values.map(v => v[0] as string);
      const tasksList: DatabaseTask[] = [];

      allTables.forEach(table => {
        const columnsRes = database.exec(`PRAGMA table_info("${table}")`);
        const columns = columnsRes[0].values.map(v => v[1] as string);
        const rowCountRes = database.exec(`SELECT COUNT(*) FROM "${table}"`);
        const rowCount = rowCountRes[0].values[0][0] as number;
        const hasSexCol = columns.some(c => c.toLowerCase() === 'sex');

        // Python's infer_text_columns implementation
        const textCandidates = ['text', 'prediction', 'question', 'category', 'header', 'text1', 'text2', 'text3', 'text4', 'text5', 'text6', 'text7', 'text8'];
        let detectedCols: string[] = [];
        
        if (table.toLowerCase().endsWith("_header")) {
          // Strict rule for _Header tables: Prioritize ["text", "text1", "text2", "notes"]
          detectedCols = columns.filter(c => ['text', 'text1', 'text2', 'notes'].includes(c.toLowerCase()));
        } else {
          detectedCols = columns.filter(c => textCandidates.includes(c.toLowerCase()));
        }

        if (detectedCols.length > 0) {
          tasksList.push({ table, columns: detectedCols, rowCount, hasSexCol });
          localAddLog(`Detected Table: ${table} (${rowCount} rows, Cols: ${detectedCols.join(', ')})`);
        }
      });
      setTasks(tasksList);
      setSelectedTaskIndices(tasksList.map((_, i) => i)); // Default all selected
      setStatus('idle');
    }
  };

  const handleDbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = new Uint8Array(await file.arrayBuffer());
    
    // Save to workspace automatically
    onSaveToWorkspace({
      name: file.name,
      type: 'source',
      content: buffer,
      mimeType: 'application/x-sqlite3',
      size: buffer.byteLength
    });

    await loadDatabase(buffer, file.name, false);
  };

  const handleWorkspaceSelect = async (file: StoredFile) => {
    if (file.content instanceof Uint8Array) {
      await loadDatabase(file.content, file.name, selectingFor === 'dest');
    } else {
      localAddLog("Error: Selected workspace file is not a valid binary database.");
    }
    setIsWorkspaceModalOpen(false);
  };

  const openWorkspaceModal = (forType: 'source' | 'dest') => {
    setSelectingFor(forType);
    setIsWorkspaceModalOpen(true);
  }

  const handleStartProcessing = async () => {
    if (!db || selectedTaskIndices.length === 0) return;
    setStatus('processing');
    const isMergeMode = !!destDb;
    const writeDb = isMergeMode ? destDb : db;
    const effectiveLang = targetLang === TargetLanguage.Other ? customLang : targetLang;

    if (!effectiveLang) {
        localAddLog("Error: Target language not specified.");
        setStatus('idle');
        return;
    }

    localAddLog(isMergeMode ? `Starting MERGE ${mode} from Source to Destination...` : `Starting batch ${mode} to ${effectiveLang}...`);

    const gemini = new GeminiService(customApiKey);
    const BATCH_SIZE = 12;

    try {
      const filteredTasks = tasks.filter(t => t.table.toLowerCase().includes(searchTerm.toLowerCase()));
      const selectedTasks = filteredTasks.filter((_, i) => selectedTaskIndices.includes(i));
      
      for (const task of selectedTasks) {
        setProgress(p => ({ ...p, currentTable: task.table, rowsTotal: task.rowCount, rowsProcessed: 0 }));
        localAddLog(`Processing table: ${task.table}`);

        // FETCH ALL COLUMNS FIRST (Fix for Header Table Logic)
        const allColsRes = db.exec(`PRAGMA table_info("${task.table}")`);
        const allColNames = allColsRes[0].values.map((v: any) => v[1]);
        const allColStr = allColNames.map((c: string) => `"${c}"`).join(', ');

        const isHeaderTable = task.table.toLowerCase().endsWith("_header");
        let whereClause = "";
        
        // MANDATORY Header Filter: Check ALL columns for the keyword 'Heading' or 'Notes'
        if (isHeaderTable) {
           const conditions = allColNames.map((col: string) => 
               `"${col}" LIKE 'Heading%' OR "${col}" LIKE 'Notes%'`
           ).join(' OR ');
           
           if (conditions) {
             whereClause = `WHERE ${conditions}`;
             localAddLog(`[Header Filter] ${task.table}: Filtering rows starting with 'Heading' or 'Notes'...`);
           }
        }
        
        let effectiveRowCount = task.rowCount;
        if (whereClause) {
           try {
             const countRes = db.exec(`SELECT COUNT(*) FROM "${task.table}" ${whereClause}`);
             effectiveRowCount = countRes[0].values[0][0] as number;
             localAddLog(`[Header Filter] ${task.table}: Found ${effectiveRowCount} matching rows.`);
           } catch (e) {
             localAddLog(`Warning: Could not count rows with WHERE clause for ${task.table}. Using total count.`);
           }
        }
        setProgress(p => ({ ...p, rowsTotal: effectiveRowCount }));

        if (effectiveRowCount === 0) {
             localAddLog(`Skipping ${task.table} (0 matching rows found).`);
             continue;
        }

        // --- DESTINATION PREPARATION (MERGE MODE) ---
        let destTableExists = true;
        let destHasCols = false;
        
        if (isMergeMode) {
           // Check if table exists in Dest
           const checkRes = writeDb.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${task.table}'`);
           if (checkRes.length === 0) {
              destTableExists = false;
              localAddLog(`Table '${task.table}' missing in Destination. Creating...`);
              // Get Schema from Source
              const schemaRes = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${task.table}'`);
              if (schemaRes.length > 0 && schemaRes[0].values[0][0]) {
                 writeDb.run(schemaRes[0].values[0][0]);
                 localAddLog(`Created table '${task.table}' in Destination.`);
              } else {
                 localAddLog(`Error: Could not retrieve schema for '${task.table}' from Source.`);
                 continue; 
              }
           }
        }

        // If table was missing (and we just created it), we need to insert ALL columns.
        // If table existed, we Update specific columns.
        // To handle both: "Add one table" implies inserting full rows. "Update" implies modifying.
        // We will fetch ALL columns from source row to support insertion if needed.
        
        for (let offset = 0; offset < effectiveRowCount; offset += BATCH_SIZE) {
          // Fetch rowid AND all columns to support full insert if needed
          const query = `SELECT rowid, ${allColStr} FROM "${task.table}" ${whereClause} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
          
          let rowsRes;
          try {
             rowsRes = db.exec(query);
          } catch(e) {
             localAddLog(`Error querying batch at offset ${offset}: ${(e as any).message}`);
             continue;
          }

          if (rowsRes.length > 0) {
            // Map results. We need 'data' for Translation (subset of cols) 
            // AND 'fullRow' for Insertion (all cols).
            const batchItems = rowsRes[0].values.map((v: any) => {
              const rowid = v[0] as number;
              
              // Full row data (excluding rowid from index 0)
              const fullRowData: Record<string, any> = {};
              allColNames.forEach((col: string, i: number) => fullRowData[col] = v[i + 1]);

              // Translatable data subset
              const translatableData: Record<string, any> = {};
              task.columns.forEach(col => translatableData[col] = fullRowData[col]);
              if (task.hasSexCol) translatableData['sex'] = fullRowData['sex']; // add context if exists

              return { rowid, data: translatableData, fullRowData }; 
            });

            // Perform Translation on the subset
            const results = await gemini.translateDatabaseBatch(batchItems.map(b => ({ rowid: b.rowid, data: b.data })), effectiveLang, mode);

            // Write to DB
            results.forEach((res, idx) => {
              const originalItem = batchItems[idx];
              // Merge translated text back into full row data
              const finalRowData = { ...originalItem.fullRowData, ...res.translatedData };

              if (isMergeMode && !destTableExists) {
                 // CASE 1: Table didn't exist, we must INSERT.
                 // We use explicit rowid to maintain consistency with source.
                 const cols = ['rowid', ...allColNames].map((c: string) => `"${c}"`).join(', ');
                 const placeholders = ['?', ...allColNames.map(() => '?')].join(', ');
                 const vals = [res.rowid, ...allColNames.map((c: string) => finalRowData[c])];
                 writeDb.run(`INSERT INTO "${task.table}" (${cols}) VALUES (${placeholders})`, vals);
              } else {
                 // CASE 2: Table exists (or we are in source-only mode). UPDATE.
                 // We only update the translated columns to avoid overwriting other data changes in destination (unless it's a new row, handled below)
                 
                 // Check if row exists in target (only relevant for Merge mode where table exists)
                 let rowExists = true;
                 if (isMergeMode) {
                   const checkRow = writeDb.exec(`SELECT 1 FROM "${task.table}" WHERE rowid=${res.rowid}`);
                   rowExists = checkRow.length > 0;
                 }

                 if (rowExists) {
                    const updateParts = Object.keys(res.translatedData)
                      .map(col => `"${col}" = ?`)
                      .join(', ');
                    const updateVals = Object.values(res.translatedData);
                    updateVals.push(res.rowid);
                    writeDb.run(`UPDATE "${task.table}" SET ${updateParts} WHERE rowid = ?`, updateVals);
                 } else {
                    // Row missing in Destination Table -> Insert Full Row
                    const cols = ['rowid', ...allColNames].map((c: string) => `"${c}"`).join(', ');
                    const placeholders = ['?', ...allColNames.map(() => '?')].join(', ');
                    const vals = [res.rowid, ...allColNames.map((c: string) => finalRowData[c])];
                    writeDb.run(`INSERT INTO "${task.table}" (${cols}) VALUES (${placeholders})`, vals);
                 }
              }
            });

            setProgress(p => ({ ...p, rowsProcessed: Math.min(offset + BATCH_SIZE, effectiveRowCount) }));
          }
        }
        localAddLog(`Finished table: ${task.table}`);
        // If we created a table, mark it as existing for subsequent loops if any (though we loop by table)
      }
      setStatus('done');
      localAddLog('Processing complete! Ready for download.');
      
      const finalDbToExport = isMergeMode ? destDb : db;
      const binaryArray = finalDbToExport.export();
      
      // Filename logic
      let outputName = fileName.replace('.db', '') + `_${effectiveLang.toLowerCase()}.db`;
      if (isMergeMode) {
         outputName = destFileName.replace('.db', '') + `_merged.db`;
      }

      onSaveToWorkspace({
        name: outputName,
        type: 'destination',
        content: binaryArray,
        mimeType: 'application/x-sqlite3',
        size: binaryArray.byteLength
      });

    } catch (err: any) {
      localAddLog(`Critical Error: ${err.message}`);
      setStatus('error');
    }
  };

  const handleDownload = () => {
    const finalDb = destDb || db;
    if (!finalDb) return;
    const binaryArray = finalDb.export();
    const blob = new Blob([binaryArray], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    let dlName = fileName.replace('.db', '') + `_${targetLang.toLowerCase()}.db`;
    if (destDb) {
       dlName = destFileName.replace('.db', '') + `_merged.db`;
    }

    a.download = dlName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadLog = () => {
    if (log.length === 0) return;
    const content = log.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translation_log_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const toggleTask = (idx: number) => {
    setSelectedTaskIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const filteredTasks = tasks.filter(t => t.table.toLowerCase().includes(searchTerm.toLowerCase()));
  const dbFiles = files.filter(f => f.name.endsWith('.db') || f.name.endsWith('.sqlite'));

  return (
    <main className="flex-1 flex flex-col p-8 gap-6 overflow-hidden relative">
      {!dbBuffer ? (
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-8 items-center justify-center h-full">
          <div className="text-center space-y-4">
             <div className="bg-indigo-600/10 p-6 rounded-full inline-block text-indigo-500 animate-pulse"><Database className="w-12 h-12" /></div>
             <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Database Localizer</h2>
             <p className="text-gray-500 font-bold uppercase text-[11px] tracking-widest max-w-sm">Directly localization of SQLite (.db) files. Specialized prompts preserve astrology nuance, whitespace, and gender context.</p>
          </div>
          <div className="w-full flex gap-4">
             <div className="flex-1 relative">
                <input type="file" accept=".db,.sqlite" onChange={handleDbUpload} className="hidden" id="db-upload" />
                <label htmlFor="db-upload" className="block border-2 border-dashed border-gray-800 bg-gray-900/10 rounded-[2.5rem] p-16 text-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group h-full flex flex-col items-center justify-center">
                  <Upload className="w-10 h-10 text-gray-600 mx-auto mb-4 group-hover:text-indigo-400" />
                  <span className="text-lg font-black text-gray-400 uppercase group-hover:text-white">Upload Source .db</span>
                </label>
             </div>
             <div className="flex-1 relative">
                <button onClick={() => openWorkspaceModal('source')} className="w-full h-full border-2 border-dashed border-gray-800 bg-gray-900/10 rounded-[2.5rem] p-16 text-center cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group flex flex-col items-center justify-center">
                  <FolderOpen className="w-10 h-10 text-gray-600 mx-auto mb-4 group-hover:text-emerald-400" />
                  <span className="text-lg font-black text-gray-400 uppercase group-hover:text-white">Select Source from Workspace</span>
                </button>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
           <div className="bg-gray-900 border border-gray-800 p-6 rounded-[2.5rem] flex items-center justify-between shadow-2xl shrink-0">
             <div className="flex items-center gap-8">
               <div className="flex flex-col gap-1.5">
                 <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Mode</span>
                 <div className="flex bg-black rounded-full p-1 border border-gray-800">
                    <button onClick={() => setMode('translate')} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${mode === 'translate' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}>Translate</button>
                    <button onClick={() => setMode('rewrite')} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${mode === 'rewrite' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}>Rewrite</button>
                 </div>
               </div>
               <div className={`flex flex-col gap-1.5 ${mode === 'rewrite' ? 'opacity-30 pointer-events-none' : ''}`}>
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Target Script</span>
                  <div className="flex gap-2">
                      <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value as TargetLanguage)}
                        className="bg-black border border-gray-800 rounded-full px-5 py-2 text-[10px] font-black text-indigo-400 outline-none"
                      >
                        {Object.values(TargetLanguage).map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      {targetLang === TargetLanguage.Other && (
                          <input 
                              type="text" 
                              className="bg-black border border-gray-800 rounded-full px-4 py-2 text-[10px] text-white focus:outline-none focus:border-indigo-500 w-32"
                              placeholder="Type Language..."
                              value={customLang}
                              onChange={(e) => setCustomLang(e.target.value)}
                          />
                      )}
                  </div>
               </div>
               <div className="h-10 w-px bg-gray-800"></div>
               <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest w-12">Source</span>
                    <span className="text-[11px] font-black text-white uppercase truncate max-w-[150px]">{fileName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest w-12">Dest</span>
                    {destDb ? (
                        <div className="flex items-center gap-2">
                           <span className="text-[11px] font-black text-emerald-400 uppercase truncate max-w-[120px]">{destFileName}</span>
                           <button onClick={() => { setDestDb(null); setDestFileName(''); }} className="text-gray-600 hover:text-red-400"><XCircle className="w-3.5 h-3.5"/></button>
                        </div>
                    ) : (
                        <button onClick={() => openWorkspaceModal('dest')} className="text-[9px] bg-gray-800 hover:bg-gray-700 px-3 py-0.5 rounded-full text-gray-400 flex items-center gap-1">
                           <ArrowRightLeft className="w-3 h-3"/> Select Target DB
                        </button>
                    )}
                  </div>
               </div>
             </div>

             <div className="flex gap-3 ml-auto">
               <Button variant="outline" className="h-10 rounded-full px-6 text-[10px] font-black" onClick={() => { setDb(null); setDbBuffer(null); setDestDb(null); setLog([]); }}>Reset App</Button>
               {status === 'done' ? (
                 <div className="flex gap-2">
                   <Button className="h-10 rounded-full px-8 text-[10px] font-black bg-emerald-600 shadow-lg shadow-emerald-900/30" onClick={handleDownload}>
                     <Download className="w-3.5 h-3.5 mr-2" /> Download Result
                   </Button>
                 </div>
               ) : (
                 <Button 
                   className="h-10 rounded-full px-10 text-[10px] font-black bg-indigo-600 shadow-lg shadow-indigo-900/40" 
                   onClick={handleStartProcessing}
                   isLoading={status === 'processing'}
                   disabled={status === 'processing' || selectedTaskIndices.length === 0}
                 >
                   {destDb ? 'Merge into Destination' : `Start Batch ${mode.toUpperCase()}`}
                 </Button>
               )}
             </div>
           </div>

           <div className="flex-1 grid grid-cols-3 gap-6 overflow-hidden">
              <div className="col-span-1 flex flex-col bg-gray-900/30 border border-gray-800 rounded-[2.5rem] overflow-hidden shadow-inner">
                 <div className="bg-gray-900 px-6 py-3 border-b border-gray-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><List className="w-3 h-3"/> Table Selection (Source)</span>
                      <button 
                        onClick={() => setSelectedTaskIndices(selectedTaskIndices.length === filteredTasks.length ? [] : filteredTasks.map((_, i) => i))}
                        className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter hover:text-indigo-300"
                      >
                        {selectedTaskIndices.length === filteredTasks.length && filteredTasks.length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="flex items-center bg-black/50 border border-gray-800 rounded-lg px-3 py-1.5 gap-2">
                       <Search className="w-3.5 h-3.5 text-gray-500" />
                       <input 
                          type="text" 
                          placeholder="Filter tables by name..." 
                          className="bg-transparent border-none text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none w-full"
                          value={searchTerm}
                          onFocus={() => setSelectedTaskIndices([])} 
                          onChange={(e) => setSearchTerm(e.target.value)}
                       />
                    </div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {filteredTasks.length === 0 ? (
                      <div className="text-center text-gray-600 text-[10px] py-4">No tables found matching "{searchTerm}"</div>
                    ) : (
                      filteredTasks.map((task, idx) => {
                        const isSelected = selectedTaskIndices.includes(idx);
                        const isHeaderTable = task.table.toLowerCase().endsWith("_header");
                        return (
                          <div 
                            key={task.table} 
                            onClick={() => toggleTask(idx)}
                            className={`cursor-pointer border p-4 rounded-2xl flex flex-col gap-2 transition-all ${isSelected ? 'bg-indigo-600/10 border-indigo-500 shadow-lg shadow-indigo-500/10' : 'bg-black/40 border-gray-800 opacity-60 hover:opacity-100'}`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                     <span className="text-[11px] font-black text-white uppercase truncate max-w-[150px]">{task.table}</span>
                                     {isHeaderTable && <span className="text-[8px] font-black bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded uppercase">Header</span>}
                                  </div>
                                  <span className="text-[9px] font-mono text-gray-600 tracking-tighter">{task.rowCount} Source Rows</span>
                              </div>
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-400' : 'border-gray-700'}`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={5} />}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {task.columns.map(c => (
                                <span key={c} className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-800 text-gray-500'}`}>{c}</span>
                              ))}
                              {task.hasSexCol && (
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${isSelected ? 'bg-pink-900/40 text-pink-400' : 'bg-gray-900 text-pink-900'}`}>Gender Context</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                 </div>
              </div>

              <div className="col-span-2 flex flex-col gap-4 overflow-hidden">
                 <div className="flex-1 bg-black/60 border border-gray-800 rounded-[2.5rem] p-6 font-mono text-[11px] overflow-hidden flex flex-col shadow-2xl">
                    <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
                       <div className="flex items-center gap-2">
                           <Scroll className="w-3.5 h-3.5 text-gray-600" />
                           <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Process Logs</span>
                       </div>
                       {log.length > 0 && (
                          <button onClick={handleDownloadLog} className="text-[9px] font-bold text-indigo-400 flex items-center gap-1 hover:text-white">
                             <DownloadCloud className="w-3 h-3" /> Save Log
                          </button>
                       )}
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-2">
                       {log.map((entry, i) => (
                         <div key={i} className={`p-1.5 rounded bg-gray-900/20 ${entry.includes('Error') ? 'text-red-400 border-l-2 border-red-500' : entry.includes('Finished') || entry.includes('complete') || entry.includes('Created') ? 'text-emerald-400 border-l-2 border-emerald-500' : 'text-gray-400'}`}>
                           {entry}
                         </div>
                       ))}
                       {log.length === 0 && <div className="h-full flex flex-col items-center justify-center text-gray-800 uppercase text-[10px] font-black">Waiting for process initiation...</div>}
                    </div>
                 </div>
                 {status === 'processing' && (
                   <div className="bg-gray-900 border border-gray-800 p-8 rounded-[2.5rem] space-y-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                      <div className="flex justify-between items-center">
                         <div className="flex items-center gap-4">
                           <div className="relative">
                              <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                              <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-20"></div>
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[11px] font-black text-white uppercase tracking-widest">{progress.currentTable}</span>
                              <span className="text-[9px] font-bold text-gray-500 uppercase">Processing Records...</span>
                           </div>
                         </div>
                         <div className="text-right">
                            <span className="text-[12px] font-black text-indigo-400 font-mono tracking-tighter">{Math.round((progress.rowsProcessed / (progress.rowsTotal || 1)) * 100)}%</span>
                            <span className="text-[8px] font-black text-gray-600 block uppercase">{progress.rowsProcessed} / {progress.rowsTotal}</span>
                         </div>
                      </div>
                      <div className="w-full bg-black h-3 rounded-full overflow-hidden border border-gray-800">
                        <div className="h-full bg-indigo-600 transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.3)]" style={{ width: `${(progress.rowsProcessed / (progress.rowsTotal || 1)) * 100}%` }}></div>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {isWorkspaceModalOpen && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-[200] flex items-center justify-center p-8">
           <div className="bg-gray-900 border border-gray-800 rounded-[2.5rem] w-full max-w-2xl flex flex-col max-h-[70vh] shadow-2xl">
              <div className="p-8 border-b border-gray-800 flex justify-between items-center">
                 <h2 className="text-xl font-black text-white uppercase tracking-tighter">Select {selectingFor === 'source' ? 'Source' : 'Destination'} Database</h2>
                 <button onClick={() => setIsWorkspaceModalOpen(false)}><XCircle className="w-6 h-6 text-gray-600 hover:text-white" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                 {dbFiles.map(file => (
                    <div key={file.id} onClick={() => handleWorkspaceSelect(file)} className="p-4 rounded-2xl bg-gray-800/50 hover:bg-indigo-600/20 border border-transparent hover:border-indigo-500 cursor-pointer flex items-center justify-between group transition-all">
                       <div className="flex items-center gap-4">
                          <div className="p-2 bg-gray-900 rounded-lg text-indigo-400"><Database className="w-5 h-5" /></div>
                          <div className="flex flex-col">
                             <span className="text-[11px] font-black text-white uppercase">{file.name}</span>
                             <span className="text-[9px] text-gray-500 font-mono">{(file.size/1024).toFixed(1)} KB • {file.createdAt.toLocaleTimeString()}</span>
                          </div>
                       </div>
                       <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400" />
                    </div>
                 ))}
                 {dbFiles.length === 0 && <div className="text-center text-gray-500 py-4 text-[10px]">No database files in workspace. Upload one first.</div>}
              </div>
           </div>
        </div>
      )}
    </main>
  );
}
