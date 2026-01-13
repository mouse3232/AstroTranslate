
import React, { useState, useRef, useImperativeHandle } from 'react';
import { Languages, RefreshCw, Split, Wand2, Scroll, Zap, FileText, Plus, ClipboardPaste } from 'lucide-react';
import { TargetLanguage, ProcessingMode, ProcessingItem, StoredFile, FileData } from '../types';
import { GeminiService } from '../services/geminiService.ts';
import { SmartBatchService } from '../services/smartBatchService';
import { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } from '../utils/parser.ts';
import { Button } from '../components/Button';

interface Props {
  customApiKey: string;
  addLog: (module: string, message: string) => void;
}

const ModeButton = ({ isActive, onClick, icon, label, tooltip }: any) => (
  <button 
    onClick={onClick}
    title={tooltip}
    className={`h-9 px-4 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 border shadow-sm ${isActive ? 'bg-primary-600 border-primary-500 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
  >
    {icon} {label}
  </button>
);

const OptionToggle = ({ active, onClick, icon, label, tooltip, disabled }: any) => {
  if (disabled) return null;
  return (
    <button 
      onClick={onClick}
      title={tooltip}
      className={`h-9 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 border shadow-sm ${active ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
    >
      {icon} {label}
    </button>
  );
};

export const PredictionsModule = React.forwardRef<any, Props>(({ customApiKey, addLog }, ref) => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [selectedLangs, setSelectedLangs] = useState<string[]>([TargetLanguage.Hindi]);
  const [mode, setMode] = useState<ProcessingMode>('translate');
  const [dualSexMode, setDualSexMode] = useState(false);
  const [shlokaMode, setShlokaMode] = useState(false);
  const [sanskritMode, setSanskritMode] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({ sent: 0, total: 0, file: '' });
  const stopRef = useRef(false);

  useImperativeHandle(ref, () => ({
    loadFile: (file: StoredFile) => {
      const newId = Math.random().toString(36).substr(2, 9);
      setFiles(p => [...p, { name: file.name, content: file.content as string, id: newId }]);
      setActiveFileId(newId);
    }
  }));

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
     if (e.target.files) Array.from(e.target.files).forEach((f: File) => {
       const r = new FileReader(); 
       r.onload = (ev) => {
         const newId = Math.random().toString(36).substr(2, 9);
         const c = ev.target?.result as string;
         setFiles(p => [...p, { name: f.name, content: c, id: newId }]);
         setActiveFileId(newId);
       };
       r.readAsText(f);
     });
  };

  const handleCreateNew = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setFiles(p => [...p, { name: 'Untitled.txt', content: '', id: newId }]);
    setActiveFileId(newId);
  };

  const handlePaste = async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        
        if (files.length === 0 || !activeFileId) {
             const newId = Math.random().toString(36).substr(2, 9);
             setFiles([{ name: 'Clipboard.txt', content: text, id: newId }]);
             setActiveFileId(newId);
             addLog('PRED', 'Created new file from clipboard content.');
        } else {
             setFiles(p => p.map(f => f.id === activeFileId ? { ...f, content: f.content + text } : f));
             addLog('PRED', 'Appended clipboard content to active file.');
        }
    } catch (e) {
        alert("Failed to read clipboard. Please allow clipboard access.");
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (files.length === 0 || !activeFileId) {
        const newId = Math.random().toString(36).substr(2, 9);
        setFiles([{ name: 'Untitled.txt', content: val, id: newId }]);
        setActiveFileId(newId);
    } else {
        setFiles(p => p.map(f => f.id === activeFileId ? { ...f, content: val } : f));
    }
  };

  const handleProcess = async () => {
    stopRef.current = false;
    setStatus('processing');
    const smartBatcher = new SmartBatchService(customApiKey);
    
    try {
      for (const file of files) {
        if (stopRef.current) break;
        setActiveFileId(file.id);
        setProgress(p => ({ ...p, file: file.name }));
        addLog('PRED', `Processing ${file.name}...`);

        for (const lang of selectedLangs) {
          if (stopRef.current) break;
          const { preamble, blocks } = parseInputFile(file.content);
          const targetBlocks: any[] = [];
          
          blocks.forEach(b => {
             if (dualSexMode) {
               targetBlocks.push({ header: updateHeaderSex(b.header, 0), lines: [...b.contentLines], gender: 'Male' });
               targetBlocks.push({ header: updateHeaderSex(b.header, 1), lines: [...b.contentLines], gender: 'Female' });
             } else {
               targetBlocks.push({ header: b.header, lines: [...b.contentLines], gender: getGenderFromHeader(b.header) });
             }
          });

          const items: ProcessingItem[] = [];
          targetBlocks.forEach((b, bIdx) => {
             const map = identifyTranslatableLines(b.lines);
             b.lines.forEach((l: string, lIdx: number) => {
               if (map[lIdx]) items.push({ text: l, context: b.gender, blockId: `b${bIdx}`, lineIndex: lIdx });
             });
          });

          setProgress(p => ({ ...p, total: items.length, sent: 0 }));

          // --- MANDATORY SMART BATCHING ---
          addLog('PRED', 'Using Smart Batching (Word-Count Optimized)');
          const resultsMap = await smartBatcher.process(
              items, lang, mode, 
              { transliterate: shlokaMode, keepSanskrit: sanskritMode },
              (c, t) => setProgress(p => ({ ...p, sent: c })), 
              () => stopRef.current,
              addLog
          );
          
          items.forEach(item => {
              const key = `${item.blockId}_${item.lineIndex}`;
              if (resultsMap[key]) {
                  const bId = parseInt(item.blockId.substring(1));
                  targetBlocks[bId].lines[item.lineIndex] = resultsMap[key];
              }
          });

          let final = preamble.trimEnd() + '\n\n';
          targetBlocks.forEach((b, i) => final += `${b.header}\n${b.lines.join('\n').trimEnd()}${i < targetBlocks.length - 1 ? '\n\n' : ''}`);
          setOutputs(p => ({ ...p, [`${file.id}_${lang}`]: final }));
          addLog('PRED', `Finished ${lang} for ${file.name}`);
        }
      }
    } catch(e: any) { addLog('ERR', e.message); }
    setStatus('idle');
  };

  const activeOutput = outputs[`${activeFileId}_${selectedLangs[0]}`] || '';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex gap-4 items-center">
           <ModeButton isActive={mode === 'translate'} onClick={() => setMode('translate')} icon={<Languages className="w-4 h-4"/>} label="Translate" />
           <ModeButton isActive={mode === 'rewrite'} onClick={() => setMode('rewrite')} icon={<RefreshCw className="w-4 h-4"/>} label="Rewrite" />
           <div className="h-6 w-px bg-slate-200"></div>
           <OptionToggle active={dualSexMode} onClick={() => setDualSexMode(!dualSexMode)} icon={<Split className="w-4 h-4"/>} label="Dual Sex" />
           <OptionToggle active={shlokaMode} onClick={() => setShlokaMode(!shlokaMode)} icon={<Wand2 className="w-4 h-4"/>} label="Transliterate" />
           <OptionToggle active={sanskritMode} onClick={() => setSanskritMode(!sanskritMode)} icon={<Scroll className="w-4 h-4"/>} label="Keep Sanskrit" />
        </div>
        <div className="flex gap-2">
           {status === 'processing' ? 
             <Button variant="destructive" onClick={() => stopRef.current = true}>Stop</Button> :
             <Button onClick={handleProcess}>Start Process</Button>
           }
        </div>
      </div>
      <div className="flex-1 flex gap-4 p-4 overflow-hidden bg-slate-50">
         <div className="flex-1 flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 p-2 flex justify-between items-center">
               <div className="flex gap-1 overflow-x-auto max-w-[400px]">
                  {files.map(f => (
                     <button key={f.id} onClick={() => setActiveFileId(f.id)} className={`px-3 py-1 text-xs rounded border ${activeFileId === f.id ? 'bg-white border-slate-300 font-bold' : 'border-transparent hover:bg-slate-200'}`}>{f.name}</button>
                  ))}
               </div>
               <div className="flex items-center gap-2">
                   <button onClick={handlePaste} className="text-xs font-bold text-slate-500 hover:text-primary-600 flex items-center gap-1 border border-slate-200 bg-white px-2 py-1 rounded">
                       <ClipboardPaste className="w-3 h-3" /> Paste Source
                   </button>
                   <button onClick={handleCreateNew} className="text-xs font-bold text-slate-500 hover:text-primary-600 flex items-center gap-1">
                       <Plus className="w-3 h-3" /> New
                   </button>
                   <label className="text-xs font-bold text-primary-600 cursor-pointer hover:underline border-l border-slate-300 pl-2 ml-1">+ Import <input type="file" multiple className="hidden" onChange={handleImport}/></label>
               </div>
            </div>
            <textarea 
                className="flex-1 p-4 font-mono text-xs resize-none focus:outline-none bg-white text-slate-900" 
                placeholder={files.length === 0 ? "Paste text here or use the 'Paste Source' button to start..." : "Enter text..."}
                value={files.find(f => f.id === activeFileId)?.content || ''} 
                onChange={handleTextChange} 
            />
         </div>
         <div className="flex-1 flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
             <div className="bg-slate-50 border-b border-slate-200 p-2 text-xs font-bold text-slate-500">Output Preview</div>
             <textarea className="flex-1 p-4 font-mono text-xs resize-none focus:outline-none bg-slate-50 text-slate-900" readOnly value={activeOutput} />
         </div>
      </div>
      {status === 'processing' && (
         <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white border border-slate-200 p-4 rounded-xl shadow-2xl w-96">
            <div className="flex justify-between text-xs font-bold mb-2"><span>{progress.file}</span><span>{Math.round((progress.sent/(progress.total||1))*100)}%</span></div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-primary-600 transition-all" style={{ width: `${(progress.sent/(progress.total||1))*100}%` }}></div></div>
         </div>
      )}
    </div>
  );
});
