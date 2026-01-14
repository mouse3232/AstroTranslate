
import React, { useState, useRef, useImperativeHandle } from 'react';
import { Languages, RefreshCw, Split, Wand2, Scroll, X } from 'lucide-react';
import { TargetLanguage, ProcessingMode, ProcessingItem, StoredFile, FileData } from '../types';
import { SmartBatchService } from '../services/smartBatchService';
import { workspaceService } from '../services/workspaceService';
import { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } from '../utils/parser';
import { Button } from '../components/Button';
import { LANGUAGES } from '../constants';
import { ToastType } from '../components/Toast';

interface Props {
  customApiKey: string;
  addLog: (module: string, message: string) => void;
  notify: (type: ToastType, message: string) => void;
}

const ModeButton = ({ isActive, onClick, icon, label, tooltip }: any) => (
  <button 
    onClick={onClick}
    title={tooltip}
    className={`h-7 px-2.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 border shadow-sm ${isActive ? 'bg-primary-600 border-primary-500 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
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
      className={`h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border shadow-sm ${active ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
    >
      {icon} {label}
    </button>
  );
};

export const PredictionsModule = React.forwardRef<any, Props>(({ customApiKey, addLog, notify }, ref) => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  
  // Language State
  const [selectedLang, setSelectedLang] = useState<string>(TargetLanguage.Hindi);
  const [customLang, setCustomLang] = useState<string>('');

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
         // SAVE TO WORKSPACE
         workspaceService.saveFile({
             id: newId,
             name: f.name,
             type: 'source',
             content: c,
             mimeType: 'text/plain',
             size: c.length,
             createdAt: new Date(),
             module: 'predictions'
         }).then(() => notify('info', `Saved ${f.name} to Workspace`));
       };
       r.readAsText(f);
     });
  };

  const handleRemoveFile = (e: React.MouseEvent, idToRemove: string) => {
      e.stopPropagation();
      const newFiles = files.filter(f => f.id !== idToRemove);
      setFiles(newFiles);
      if (activeFileId === idToRemove) {
          setActiveFileId(newFiles.length > 0 ? newFiles[newFiles.length - 1].id : '');
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
    stopRef.current = false;
    setStatus('processing');
    const smartBatcher = new SmartBatchService(customApiKey);
    
    // Determine effective target language
    const effectiveLang = selectedLang === TargetLanguage.Other ? customLang : selectedLang;
    if (!effectiveLang.trim()) {
        addLog('ERR', 'Please select or enter a target language.');
        notify('error', 'Target language required');
        setStatus('idle');
        return;
    }

    try {
      for (const file of files) {
        if (stopRef.current) break;
        setActiveFileId(file.id);
        setProgress(p => ({ ...p, file: file.name }));
        addLog('PRED', `Processing ${file.name} to ${effectiveLang}...`);

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
            items, effectiveLang, mode, 
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
        
        const outputKey = `${file.id}_${effectiveLang}`;
        setOutputs(p => ({ ...p, [outputKey]: final }));
        
        // Auto Save to Workspace
        const outputName = `Trans_${file.name}_${effectiveLang}`;
        workspaceService.saveFile({
            id: Math.random().toString(36).substr(2, 9),
            name: outputName,
            content: final,
            type: 'destination',
            mimeType: 'text/plain',
            size: final.length,
            createdAt: new Date(),
            module: 'predictions'
        }).then(() => addLog('PRED', `Saved ${outputName} to Workspace`));

        addLog('PRED', `Finished ${effectiveLang} for ${file.name}`);
      }
      if (!stopRef.current) notify('success', 'Prediction Translation Completed');
    } catch(e: any) { 
        addLog('ERR', e.message); 
        notify('error', e.message);
    }
    setStatus('idle');
  };

  const effectiveOutputLang = selectedLang === TargetLanguage.Other ? customLang : selectedLang;
  const activeOutput = outputs[`${activeFileId}_${effectiveOutputLang}`] || '';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm flex-wrap gap-2 h-12">
        <div className="flex gap-2 items-center flex-wrap">
           <ModeButton isActive={mode === 'translate'} onClick={() => setMode('translate')} icon={<Languages className="w-3.5 h-3.5"/>} label="Translate" />
           <ModeButton isActive={mode === 'rewrite'} onClick={() => setMode('rewrite')} icon={<RefreshCw className="w-3.5 h-3.5"/>} label="Rewrite" />
           <div className="h-5 w-px bg-slate-200 hidden md:block"></div>
           
           {/* Language Selector */}
           <div className="flex items-center gap-1.5">
             <select 
               value={selectedLang} 
               onChange={e => setSelectedLang(e.target.value)} 
               className="h-7 bg-white border border-slate-200 text-slate-700 text-[10px] font-bold rounded-md focus:ring-primary-500 focus:border-primary-500 block px-1 outline-none shadow-sm"
             >
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
             </select>
             {selectedLang === TargetLanguage.Other && (
               <input 
                 type="text" 
                 placeholder="Language..." 
                 value={customLang}
                 onChange={e => setCustomLang(e.target.value)}
                 className="h-7 w-20 px-2 text-[10px] border border-slate-300 rounded-md focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 bg-white text-slate-900 font-bold placeholder-slate-400"
               />
             )}
           </div>

           <div className="h-5 w-px bg-slate-200 hidden md:block"></div>
           <OptionToggle active={dualSexMode} onClick={() => setDualSexMode(!dualSexMode)} icon={<Split className="w-3.5 h-3.5"/>} label="Dual Sex" />
           {mode !== 'rewrite' && (
              <>
                 <OptionToggle active={shlokaMode} onClick={toggleShloka} icon={<Wand2 className="w-3.5 h-3.5"/>} label="Transliterate" />
                 <OptionToggle active={sanskritMode} onClick={toggleSanskrit} icon={<Scroll className="w-3.5 h-3.5"/>} label="Keep Sanskrit" />
              </>
           )}
        </div>
        <div className="flex gap-2">
           {status === 'processing' ? 
             <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => stopRef.current = true}>Stop</Button> :
             <Button size="sm" className="h-7 px-4 text-[10px]" onClick={handleProcess}>Start Process</Button>
           }
        </div>
      </div>
      <div className="flex-1 flex gap-4 p-4 overflow-hidden bg-slate-50">
         <div className="flex-1 flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 p-2 flex justify-between items-center">
               <div className="flex gap-1 overflow-x-auto max-w-[400px] custom-scrollbar pb-1">
                  {files.map(f => (
                     <div key={f.id} className={`group flex items-center gap-1 pl-3 pr-1 py-1 text-xs rounded border transition-all ${activeFileId === f.id ? 'bg-white border-slate-300 font-bold shadow-sm' : 'border-transparent hover:bg-slate-100'}`}>
                         <button onClick={() => setActiveFileId(f.id)} className="truncate max-w-[100px]">{f.name}</button>
                         <button 
                            onClick={(e) => handleRemoveFile(e, f.id)} 
                            className={`p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-red-500 ${activeFileId === f.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                         >
                            <X className="w-3 h-3" />
                         </button>
                     </div>
                  ))}
               </div>
               <div className="flex items-center gap-2">
                   <label className="text-xs font-bold text-primary-600 cursor-pointer hover:underline pl-2">+ Import <input type="file" multiple className="hidden" onChange={handleImport}/></label>
               </div>
            </div>
            <textarea 
                className="flex-1 p-4 font-mono text-xs resize-none focus:outline-none bg-white text-slate-900" 
                placeholder={files.length === 0 ? "Use the '+ Import' button to start..." : "Enter text..."}
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
         <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white border border-slate-200 p-4 rounded-xl shadow-2xl w-96 z-50">
            <div className="flex justify-between text-xs font-bold mb-2"><span>{progress.file}</span><span>{Math.round((progress.sent/(progress.total||1))*100)}%</span></div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-primary-600 transition-all" style={{ width: `${(progress.sent/(progress.total||1))*100}%` }}></div></div>
         </div>
      )}
    </div>
  );
});
