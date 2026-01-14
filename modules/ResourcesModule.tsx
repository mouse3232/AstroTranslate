
import React, { useState, useRef, useImperativeHandle } from 'react';
import { PlusCircle, ArrowRight, CheckCircle2, Download } from 'lucide-react';
import { TargetLanguage, StoredFile, FileData } from '../types';
import { GeminiService } from '../services/geminiService';
import { workspaceService } from '../services/workspaceService';
import { Button } from '../components/Button';
import FileUpload from '../components/FileUpload';
import CodeBlock from '../components/CodeBlock';
import { LANGUAGES } from '../constants';
import { ToastType } from '../components/Toast';

interface Props {
  customApiKey: string;
  addLog: (module: string, message: string) => void;
  notify: (type: ToastType, message: string) => void;
}

export const ResourcesModule = React.forwardRef<any, Props>(({ customApiKey, addLog, notify }, ref) => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  
  const [selectedLang, setSelectedLang] = useState<string>(TargetLanguage.Hindi);
  const [customLang, setCustomLang] = useState<string>('');
  
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const stopRef = useRef(false);

  useImperativeHandle(ref, () => ({
    loadFile: (file: StoredFile) => {
        const id = Math.random().toString();
        setFiles(p => [...p, { name: file.name, content: file.content as string, id }]);
        setActiveFileId(id);
    }
  }));

  const handleImport = (content: string, name: string) => {
    const id = Math.random().toString();
    setFiles(p => [...p, { name, content, id }]);
    setActiveFileId(id);
    notify('info', `Imported ${name}`);
    workspaceService.saveFile({
        id,
        name,
        type: 'source',
        content,
        mimeType: 'text/plain',
        size: content.length,
        createdAt: new Date(),
        module: 'resources'
    }).then(() => notify('info', `Saved ${name} to Workspace`));
  };

  const handleProcess = async () => {
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
        for (const file of files) {
            if (stopRef.current) break;
            setActiveFileId(file.id);
            addLog('RES', `Processing ${file.name} to ${effectiveLang}...`);
            
            const isKV = file.name.match(/\.(txt|res|dat)$/);
            let result = '';

            if (isKV) {
                result = await gemini.translateDotNetResource(
                    file.content, effectiveLang, 
                    (curr, tot) => setProgress(Math.round((curr/tot)*100)), 
                    () => stopRef.current
                );
            } else {
                result = await gemini.translateResourceFile(file.content, 'English', effectiveLang);
            }
            
            setOutputs(p => ({ ...p, [file.id]: result }));
            addLog('RES', `Finished ${file.name}`);
            workspaceService.saveFile({ id: Math.random().toString(), name: `Trans_${file.name}`, content: result, type: 'destination', mimeType: 'text/plain', size: result.length, createdAt: new Date(), module: 'resources' });
        }
        if (!stopRef.current) notify('success', 'Resource Translation Completed');
    } catch(e: any) { 
        addLog('ERR', e.message); 
        notify('error', e.message);
    }
    setStatus('idle');
  };

  const activeFile = files.find(f => f.id === activeFileId);
  const activeOutput = outputs[activeFileId] || '';
  const displayLang = selectedLang === TargetLanguage.Other ? customLang || 'Custom' : selectedLang;

  return (
     <div className="flex flex-col h-full bg-white">
        <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10 h-12">
           <div className="flex items-center gap-4">
              <div className="flex flex-col">
                  <h2 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Resource Localizer</h2>
              </div>
              <div className="h-5 w-px bg-slate-200"></div>
              <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Target:</label>
                  <select value={selectedLang} onChange={e => setSelectedLang(e.target.value)} className="h-7 bg-slate-50 border border-slate-300 text-slate-700 text-[11px] rounded-md focus:ring-primary-500 focus:border-primary-500 block px-2 outline-none font-bold">
                      {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  {selectedLang === TargetLanguage.Other && (
                      <input 
                        type="text" 
                        placeholder="Type..." 
                        value={customLang}
                        onChange={e => setCustomLang(e.target.value)}
                        className="h-7 w-20 bg-white border border-slate-300 text-slate-900 text-[11px] rounded-md focus:ring-primary-500 focus:border-primary-500 block px-2 outline-none font-bold placeholder-slate-400"
                      />
                  )}
              </div>
           </div>
           <div className="flex items-center gap-3">
               {status === 'processing' && <span className="text-[10px] font-bold text-primary-600 animate-pulse bg-primary-50 px-2 py-0.5 rounded-full">Processing... {progress}%</span>}
               <Button size="sm" onClick={handleProcess} disabled={files.length === 0} isLoading={status === 'processing'} className="px-4 h-7 text-[10px]">Start Process</Button>
           </div>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-50 p-4 flex flex-col">
            {files.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full">
                    <FileUpload onFileSelect={(c, n) => handleImport(c, n)} />
                </div>
            ) : (
                <div className="flex-1 flex gap-4 min-h-0">
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex gap-1 overflow-x-auto mb-1 shrink-0 pb-1">
                            {files.map(f => (
                                <button key={f.id} onClick={() => setActiveFileId(f.id)} className={`px-3 py-1.5 rounded-t-lg text-[10px] font-bold border-t border-x transition-all ${activeFileId === f.id ? 'bg-white border-slate-300 text-primary-600 shadow-[0_-2px_5px_rgba(0,0,0,0.02)] relative z-10' : 'bg-slate-200/50 border-transparent text-slate-500 hover:bg-slate-200'}`}>
                                    {f.name}
                                </button>
                            ))}
                            <div className="ml-2 flex items-center">
                                <label className="p-1 bg-white border border-slate-300 rounded text-primary-600 hover:bg-primary-50 cursor-pointer transition-colors shadow-sm" title="Add File">
                                    <PlusCircle className="w-3.5 h-3.5" />
                                    <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = ev => handleImport(ev.target?.result as string, f.name); r.readAsText(f); }}}/>
                                </label>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 relative z-0">
                             <CodeBlock title="Source Code" code={activeFile?.content || ''} />
                        </div>
                    </div>

                    <div className="flex flex-col items-center justify-center text-slate-300 gap-2">
                        <div className="h-full w-px bg-slate-200/50"></div>
                        <div className="p-1.5 bg-white rounded-full shadow border border-slate-200">
                             <ArrowRight className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="h-full w-px bg-slate-200/50"></div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                         <div className="mb-1 shrink-0 h-8 flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Output Preview
                            </span>
                            {activeOutput && <button className="text-[10px] font-bold text-white bg-green-600 hover:bg-green-700 px-2 py-1 rounded shadow-sm flex items-center gap-1 transition-all" onClick={() => {
                                const b = new Blob([activeOutput], {type: 'text/plain'});
                                const u = URL.createObjectURL(b);
                                const a = document.createElement('a'); a.href = u; a.download = `Translated_${activeFile?.name}`; a.click();
                            }}><Download className="w-3 h-3"/> Download</button>}
                         </div>
                         <div className="flex-1 min-h-0">
                             <CodeBlock title={displayLang} code={activeOutput} />
                         </div>
                    </div>
                </div>
            )}
        </div>
     </div>
  );
});
