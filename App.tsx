
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Sparkles, FileText, Settings2, Code, Database, AlignLeft, HardDrive, Terminal, DownloadCloud, Home, Type, Space, MoveVertical, PenTool
} from 'lucide-react';
import { StoredFile } from './types';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import { Button } from './components/Button';
import { ToastContainer, ToastType, ToastMessage } from './components/Toast';
import { PredictionsModule } from './modules/PredictionsModule';
import { ResourcesModule } from './modules/ResourcesModule';
import { DatabaseModule } from './modules/DatabaseModule';
import { FormatterModule } from './modules/FormatterModule';
import { CharCheckModule } from './modules/CharCheckModule';
import { WhitespaceModule } from './modules/WhitespaceModule';
import { LineSpacingModule } from './modules/LineSpacingModule';
import { PunctuationModule } from './modules/PunctuationModule';
import { HomeDashboard } from './components/HomeDashboard';
import { workspaceService } from './services/workspaceService';

type AppModule = 'home' | 'resources' | 'predictions' | 'database' | 'formatter' | 'charcheck' | 'whitespace' | 'linespacing' | 'punctuation';

interface LogEntry {
  timestamp: string;
  module: string;
  message: string;
}

const TerminalWindow = ({ logs }: { logs: LogEntry[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const downloadLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.module}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs.txt`;
    a.click();
  };

  return (
    <div className="h-32 bg-slate-50 border-t border-slate-200 flex flex-col font-mono text-[10px] shrink-0 animate-in slide-in-from-bottom duration-300">
      <div className="px-3 py-1.5 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
          <Terminal className="w-3 h-3" /> System Output
        </div>
        <button onClick={downloadLogs} className="text-[9px] flex items-center gap-1 text-primary-600 hover:text-primary-700 font-bold">
           <DownloadCloud className="w-3 h-3" /> Export Logs
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar bg-white">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 border-b border-slate-50 pb-0.5">
            <span className="text-slate-400 shrink-0">[{log.timestamp}]</span>
            <span className={`font-bold shrink-0 ${log.module === 'ERR' ? 'text-red-600' : 'text-primary-600'}`}>[{log.module}]</span>
            <span className="text-slate-600">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  
  // Initialize from LocalStorage OR Server Injected Key OR Env
  const [apiKey, setApiKey] = useState(() => {
    const local = localStorage.getItem('gemini_api_key');
    if (local) return local;
    
    // Check for propagated key from server
    // @ts-ignore
    if (typeof window !== 'undefined' && window.__SERVER_ENV__?.API_KEY) {
        // @ts-ignore
        return window.__SERVER_ENV__.API_KEY;
    }

    // Check process env (if defined at build time)
    if (typeof process !== 'undefined' && process.env?.API_KEY) {
        return process.env.API_KEY;
    }

    return '';
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  const predictionsRef = useRef<any>(null);
  const resourcesRef = useRef<any>(null);
  const databaseRef = useRef<any>(null);
  const formatterRef = useRef<any>(null);
  const charCheckRef = useRef<any>(null);
  const whitespaceRef = useRef<any>(null);
  const lineSpacingRef = useRef<any>(null);
  const punctuationRef = useRef<any>(null);

  const addLog = useCallback((module: string, message: string) => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), module, message }]);
  }, []);

  const notify = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleWorkspaceLoad = (file: StoredFile) => {
    // Basic module mapping validation
    let targetRef;
    if (activeModule === 'predictions' && file.module === 'predictions') targetRef = predictionsRef;
    else if (activeModule === 'resources' && file.module === 'resources') targetRef = resourcesRef;
    else if (activeModule === 'database' && file.module === 'database') targetRef = databaseRef;
    else if (activeModule === 'formatter' && file.module === 'formatter') targetRef = formatterRef;
    else if (activeModule === 'charcheck') targetRef = charCheckRef;
    else if (activeModule === 'whitespace') targetRef = whitespaceRef; 
    else if (activeModule === 'linespacing') targetRef = lineSpacingRef;
    else if (activeModule === 'punctuation') targetRef = punctuationRef;
    
    // Loose compatibility for DB files between modules
    const dbModules = ['database', 'formatter', 'charcheck', 'whitespace', 'linespacing', 'punctuation'];
    if (!targetRef && dbModules.includes(activeModule) && dbModules.includes(file.module)) {
          if (activeModule === 'database') targetRef = databaseRef;
          if (activeModule === 'formatter') targetRef = formatterRef;
          if (activeModule === 'charcheck') targetRef = charCheckRef;
          if (activeModule === 'whitespace') targetRef = whitespaceRef;
          if (activeModule === 'linespacing') targetRef = lineSpacingRef;
          if (activeModule === 'punctuation') targetRef = punctuationRef;
    }

    if (!targetRef) {
      notify('error', `Cannot load ${file.module} file into ${activeModule} module.`);
      return;
    }
    
    // @ts-ignore
    targetRef.current?.loadFile(file);
    setIsWorkspaceOpen(false);
    addLog('SYS', `Loaded file: ${file.name}`);
    notify('success', `Loaded ${file.name}`);
  };

  const NavItem = ({ id, label, icon }: any) => (
    <button 
      onClick={() => setActiveModule(id)}
      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 border ${activeModule === id ? 'text-white bg-slate-800 border-slate-700 shadow-sm' : 'text-slate-500 bg-white border-transparent hover:bg-slate-50'}`}
    >
      {icon} <span className="hidden lg:inline">{label}</span>
      <span className="lg:hidden">{label.split(' ')[0]}</span>
    </button>
  );

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => setActiveModule('home')}>
          <div className="bg-primary-600 p-2 rounded-md shadow-sm group-hover:bg-primary-700 transition-colors"><Sparkles className="w-4 h-4 text-white" /></div>
          <div className="flex flex-col justify-center"><h1 className="text-sm font-bold uppercase leading-none text-slate-800 mb-0.5">AI Translation</h1><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">Suite</span></div>
        </div>
        
        {/* Navigation Bar - Compact Sleek */}
        <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100/50 rounded-lg border border-slate-200/60 backdrop-blur-sm">
           <NavItem id="home" label="Home" icon={<Home className="w-3.5 h-3.5"/>} />
           <div className="w-px h-4 bg-slate-300 mx-1"></div>
           <NavItem id="resources" label="Resources" icon={<Code className="w-3.5 h-3.5"/>} />
           <NavItem id="predictions" label="Text Translation" icon={<FileText className="w-3.5 h-3.5"/>} />
           <NavItem id="database" label="Database" icon={<Database className="w-3.5 h-3.5"/>} />
           <NavItem id="formatter" label="Tab Formatting" icon={<AlignLeft className="w-3.5 h-3.5"/>} />
           <NavItem id="whitespace" label="Space Cleaner" icon={<Space className="w-3.5 h-3.5"/>} />
           <NavItem id="linespacing" label="Line Spacing" icon={<MoveVertical className="w-3.5 h-3.5"/>} />
           <NavItem id="punctuation" label="Punctuation" icon={<PenTool className="w-3.5 h-3.5"/>} />
           <NavItem id="charcheck" label="Char Check" icon={<Type className="w-3.5 h-3.5"/>} />
        </div>

        <div className="flex items-center gap-1.5">
           {activeModule !== 'home' && (
             <button onClick={() => setIsWorkspaceOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 rounded-md text-slate-500 font-bold text-xs uppercase border border-transparent hover:border-slate-200 transition-all mr-1">
               <HardDrive className="w-3.5 h-3.5 text-primary-600" /> Workspace
             </button>
           )}
           <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"><Settings2 className="w-4 h-4" /></button>
        </div>
      </header>

      <WorkspaceDrawer isOpen={isWorkspaceOpen} onClose={() => setIsWorkspaceOpen(false)} activeModule={activeModule} onLoadFile={handleWorkspaceLoad} />
      
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[200] flex items-center justify-center">
           <div className="bg-white p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100">
              <h2 className="text-base font-bold mb-4 text-slate-800">Application Settings</h2>
              
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">GEMINI API KEY</label>
              <input 
                  type="text" 
                  className="w-full border border-slate-300 p-2 rounded-lg mb-6 text-xs font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all" 
                  placeholder="Enter your Gemini API Key..." 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)} 
              />
              
              <div className="flex justify-end gap-2">
                 <Button size="sm" variant="secondary" onClick={() => setIsSettingsOpen(false)}>Cancel</Button>
                 <Button size="sm" onClick={() => { localStorage.setItem('gemini_api_key', apiKey); setIsSettingsOpen(false); notify('success', 'API Key Saved'); }}>Save Settings</Button>
              </div>
           </div>
        </div>
      )}

      {/* Main Content Area - All modules mounted but hidden when inactive to preserve state */}
      
      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'home' ? 'flex' : 'hidden'}`}>
         <HomeDashboard onSelectModule={(m) => setActiveModule(m as AppModule)} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'resources' ? 'flex' : 'hidden'}`}>
        <ResourcesModule ref={resourcesRef} customApiKey={apiKey} addLog={addLog} notify={notify} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'predictions' ? 'flex' : 'hidden'}`}>
        <PredictionsModule ref={predictionsRef} customApiKey={apiKey} addLog={addLog} notify={notify} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'database' ? 'flex' : 'hidden'}`}>
        <DatabaseModule ref={databaseRef} customApiKey={apiKey} addLog={addLog} notify={notify} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'formatter' ? 'flex' : 'hidden'}`}>
        <FormatterModule ref={formatterRef} addLog={addLog} notify={notify} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'whitespace' ? 'flex' : 'hidden'}`}>
        <WhitespaceModule ref={whitespaceRef} addLog={addLog} notify={notify} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'linespacing' ? 'flex' : 'hidden'}`}>
        <LineSpacingModule ref={lineSpacingRef} addLog={addLog} notify={notify} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'punctuation' ? 'flex' : 'hidden'}`}>
        <PunctuationModule ref={punctuationRef} addLog={addLog} notify={notify} />
      </div>

      <div className={`flex-1 overflow-hidden flex flex-col ${activeModule === 'charcheck' ? 'flex' : 'hidden'}`}>
        <CharCheckModule ref={charCheckRef} addLog={addLog} notify={notify} />
      </div>

      {/* System Output - Hidden on Home and when empty */}
      {activeModule !== 'home' && logs.length > 0 && (
        <TerminalWindow logs={logs} />
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
