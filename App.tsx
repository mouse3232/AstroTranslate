
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Sparkles, FileText, Settings2, Code, Database, AlignLeft, HardDrive, Terminal, DownloadCloud, Home,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { StoredFile } from './types';
import { WorkspaceDrawer } from './components/WorkspaceDrawer';
import { Button } from './components/Button';
import { PredictionsModule } from './modules/PredictionsModule';
import { ResourcesModule } from './modules/ResourcesModule';
import { DatabaseModule } from './modules/DatabaseModule';
import { FormatterModule } from './modules/FormatterModule';
import { HomeDashboard } from './components/HomeDashboard';

type AppModule = 'home' | 'predictions' | 'resources' | 'database' | 'formatter';

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
    <div className="h-36 bg-slate-50 border-t border-slate-200 flex flex-col font-mono text-[11px] shrink-0 animate-in slide-in-from-bottom duration-300">
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
          <Terminal className="w-3 h-3" /> System Output
        </div>
        <button onClick={downloadLogs} className="text-[10px] flex items-center gap-1 text-primary-600 hover:text-primary-700 font-bold">
           <DownloadCloud className="w-3 h-3" /> Export Logs
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar bg-white">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 border-b border-slate-50 pb-1">
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
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem('gemini_api_key') || '';
    } catch (error) {
      console.warn('Could not read API key from localStorage:', error);
      return '';
    }
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const predictionsRef = useRef<any>(null);
  const resourcesRef = useRef<any>(null);
  const databaseRef = useRef<any>(null);
  const formatterRef = useRef<any>(null);

  const addLog = useCallback((module: string, message: string) => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), module, message }]);
  }, []);

  const handleWorkspaceLoad = (file: StoredFile) => {
    if (file.module !== activeModule) {
      toast.error(`Cannot load ${file.module} file into ${activeModule} module.`);
      return;
    }
    const target = activeModule === 'predictions' ? predictionsRef :
                   activeModule === 'resources' ? resourcesRef :
                   activeModule === 'database' ? databaseRef : formatterRef;
    
    // @ts-ignore
    target.current?.loadFile(file);
    setIsWorkspaceOpen(false);
    addLog('SYS', `Loaded file: ${file.name}`);
    toast.success(`Loaded file: ${file.name}`);
  };

  const NavItem = ({ id, label, icon }: any) => (
    <button 
      onClick={() => setActiveModule(id)}
      className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-all flex items-center gap-2 border ${activeModule === id ? 'text-white bg-slate-800 border-slate-700' : 'text-slate-500 bg-white border-transparent hover:bg-slate-50'}`}
    >
      {icon} <span className="hidden md:inline">{label}</span>
    </button>
  );

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <Toaster position="bottom-right" toastOptions={{
        className: 'text-xs font-sans',
        duration: 4000,
        success: {
          style: {
            background: '#F0FFF4', // green-50
            color: '#22543D', // green-900
            border: '1px solid #9AE6B4' // green-300
          },
          iconTheme: {
            primary: '#38A169', // green-600
            secondary: 'white',
          },
        },
        error: {
           style: {
            background: '#FFF5F5', // red-50
            color: '#742A2A', // red-900
            border: '1px solid #FEB2B2' // red-300
          },
           iconTheme: {
            primary: '#C53030', // red-600
            secondary: 'white',
          },
        }
      }} />
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setActiveModule('home')}>
          <div className="bg-primary-600 p-2 rounded-lg shadow-md"><Sparkles className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-base font-bold uppercase">AI Translation</h1><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Localizer Suite</span></div>
        </div>
        
        {/* Navigation Bar - Always visible for quick switching */}
        <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
           <NavItem id="home" label="Home" icon={<Home className="w-3.5 h-3.5"/>} />
           <div className="w-px h-4 bg-slate-300 mx-1"></div>
           <NavItem id="predictions" label="Predictions" icon={<FileText className="w-3.5 h-3.5"/>} />
           <NavItem id="resources" label="Resources" icon={<Code className="w-3.5 h-3.5"/>} />
           <NavItem id="database" label="Database" icon={<Database className="w-3.5 h-3.5"/>} />
           <NavItem id="formatter" label="Formatter" icon={<AlignLeft className="w-3.5 h-3.5"/>} />
        </div>

        <div className="flex items-center gap-2">
           {activeModule !== 'home' && (
             <button onClick={() => setIsWorkspaceOpen(true)} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 rounded-lg text-slate-500 font-bold text-[11px] uppercase border border-transparent hover:border-slate-200 transition-all mr-2">
               <HardDrive className="w-4 h-4 text-primary-600" /> Workspace
             </button>
           )}
           <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><Settings2 className="w-5 h-5" /></button>
        </div>
      </header>

      <WorkspaceDrawer isOpen={isWorkspaceOpen} onClose={() => setIsWorkspaceOpen(false)} activeModule={activeModule} onLoadFile={handleWorkspaceLoad} />
      
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[200] flex items-center justify-center">
           <div className="bg-white p-8 rounded-2xl max-w-md w-full shadow-xl">
              <h2 className="text-lg font-bold mb-4">Settings</h2>
              <input type="text" className="w-full border p-2 rounded mb-4 text-sm font-mono" placeholder="Gemini API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} />
              <div className="flex justify-end gap-2">
                 <Button onClick={() => {
                   try {
                     localStorage.setItem('gemini_api_key', apiKey);
                     toast.success('API Key saved successfully!');
                     setIsSettingsOpen(false);
                   } catch (error) {
                      toast.error('Could not save API Key.');
                      console.error('Failed to save API Key to localStorage:', error);
                   }
                 }}>Save</Button>
                 <Button variant="secondary" onClick={() => setIsSettingsOpen(false)}>Cancel</Button>
              </div>
           </div>
        </div>
      )}

      {/* Main Content Area */}
      
      {activeModule === 'home' && (
         <HomeDashboard onSelectModule={(m) => setActiveModule(m as AppModule)} />
      )}

      {activeModule === 'predictions' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <PredictionsModule ref={predictionsRef} customApiKey={apiKey} addLog={addLog} />
        </div>
      )}

      {activeModule === 'resources' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <ResourcesModule ref={resourcesRef} customApiKey={apiKey} addLog={addLog} />
        </div>
      )}

      {activeModule === 'database' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <DatabaseModule ref={databaseRef} customApiKey={apiKey} addLog={addLog} />
        </div>
      )}

      {activeModule === 'formatter' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <FormatterModule ref={formatterRef} addLog={addLog} />
        </div>
      )}

      {/* System Output - Hidden on Home and when empty */}
      {activeModule !== 'home' && logs.length > 0 && (
        <TerminalWindow logs={logs} />
      )}
    </div>
  );
}
