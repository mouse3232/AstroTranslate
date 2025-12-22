import React, { useState, useRef } from 'react';
import { Upload, Download, Languages, Split, Sparkles, Wand2, XCircle, CheckCircle2, Files, RefreshCw, Type as TypeIcon, Search, AlertTriangle, ArrowRight, Check, Scroll, BookOpen, Filter, Settings2 } from 'lucide-react';
import { LANGUAGES } from './constants';
import { TargetLanguage, ProcessingMode, ProcessingItem, BatchResponse } from './types';
import { GeminiService } from './services/geminiService';
import { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } from './utils/parser';
import { Button } from './components/Button';

// Default example content
const DEFAULT_CONTENT = `FileHeader.txt

#* Planet=0,Case=0
##*Text
You have debilitated Jupiter in lagna which is under the influence of <PlanetInfluence>.
As a successful businessperson, you should recite Hanuman Chalisa daily.

#* Planet=0,Case=1
##*Text
v©"kf/k ef.k  ea=k.kka]  xzg&u{k=  rkfjdk A
ÒkX;dkys ÒosfRlf)% vÒkX;a fu"Qya Òosr AA`;

interface FileData {
  name: string;
  content: string;
  id: string;
}

interface PendingReview {
  fileId: string;
  lang: string;
  items: {
    blockId: string;
    lineIndex: number;
    originalDecoded: string;
    suggestedText: string;
    reason: string;
    source: string;
  }[];
  finalOutputBuilder: (reviewedItems: Record<string, string>) => void;
}

function App() {
  const [files, setFiles] = useState<FileData[]>([
    { name: 'Default_Example.txt', content: DEFAULT_CONTENT, id: 'default' }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('default');
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  
  const [selectedLangs, setSelectedLangs] = useState<string[]>([TargetLanguage.Hindi]);
  const [mode, setMode] = useState<ProcessingMode>('translate');
  const [dualSexMode, setDualSexMode] = useState(false);
  const [autoDownload, setAutoDownload] = useState(true);
  const [shlokaMode, setShlokaMode] = useState(false);
  const [sanskritMode, setSanskritMode] = useState(false);
  const [yogaMode, setYogaMode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'stopped' | 'error'>('idle');
  
  // Modals
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [reviewData, setReviewData] = useState<PendingReview | null>(null);

  const [progress, setProgress] = useState({
    fileIndex: 0, totalFiles: 0, langIndex: 0, totalLangs: 0,
    blocksSent: 0, blocksTotal: 0, currentFileName: ''
  });
  
  const [errorMsg, setErrorMsg] = useState('');
  const stopProcessingRef = useRef(false);

  // --- Handlers ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const newFiles: FileData[] = [];
    let processedCount = 0;
    (Array.from(fileList) as File[]).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        newFiles.push({
          name: file.name,
          content: event.target?.result as string,
          id: Math.random().toString(36).substr(2, 9)
        });
        processedCount++;
        if (processedCount === fileList.length) {
          setFiles(newFiles);
          setActiveFileId(newFiles[0].id);
          setOutputs({});
        }
      };
      reader.readAsText(file);
    });
  };

  const toggleLanguage = (langValue: string) => {
    setSelectedLangs(prev => 
      prev.includes(langValue) 
        ? (prev.length === 1 ? prev : prev.filter(l => l !== langValue)) 
        : [...prev, langValue]
    );
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

  const generateFileName = (originalName: string, lang: string) => {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
    const modeStr = dualSexMode ? 'dual_sex' : 'standard';
    const langLabel = LANGUAGES.find(l => l.value === lang)?.label.split(' ')[0].toLowerCase() || lang.toLowerCase();
    let suffix = 'translated';
    if (mode === 'rewrite') suffix = 'rewritten';
    if (mode === 'convert_encoding') suffix = 'converted_unicode';
    return `${nameWithoutExt}_${suffix}_${langLabel}_${modeStr}.txt`;
  };

  // --- Core Processing Logic ---
  const handleProcess = async () => {
    stopProcessingRef.current = false;
    setStatus('processing');
    setOutputs({});
    setErrorMsg('');
    setReviewData(null);
    
    setProgress({
      fileIndex: 0, totalFiles: files.length, langIndex: 0, totalLangs: selectedLangs.length,
      blocksSent: 0, blocksTotal: 0, currentFileName: ''
    });

    try {
      const gemini = new GeminiService(process.env.API_KEY!);

      for (let fIndex = 0; fIndex < files.length; fIndex++) {
        if (stopProcessingRef.current) { setStatus('stopped'); return; }
        const currentFile = files[fIndex];
        
        for (let lIndex = 0; lIndex < selectedLangs.length; lIndex++) {
          if (stopProcessingRef.current) { setStatus('stopped'); return; }
          const currentLang = selectedLangs[lIndex];
          
          const { preamble, blocks } = parseInputFile(currentFile.content);

          // Prepare blocks
          interface TargetBlock {
            header: string; lines: string[]; gender: 'Male' | 'Female' | 'Neutral';
          }
          const baseTargetBlocks: TargetBlock[] = [];
          blocks.forEach(block => {
            // Yoga Mode Filtering
            if (yogaMode) {
              const match = block.header.match(/PopularityFlag=(\d+)/);
              // Only include blocks where PopularityFlag is explicitly 1
              if (!match || match[1] !== '1') {
                return; 
              }
            }

            if (dualSexMode) {
              baseTargetBlocks.push({ header: updateHeaderSex(block.header, 0), lines: [...block.contentLines], gender: 'Male' });
              baseTargetBlocks.push({ header: updateHeaderSex(block.header, 1), lines: [...block.contentLines], gender: 'Female' });
            } else {
              baseTargetBlocks.push({ header: block.header, lines: [...block.contentLines], gender: getGenderFromHeader(block.header) });
            }
          });

          // Identify items
          const processingItems: ProcessingItem[] = [];
          baseTargetBlocks.forEach((block, blockIdx) => {
            const translatableMap = identifyTranslatableLines(block.lines);
            block.lines.forEach((line, lineIdx) => {
              if (translatableMap[lineIdx]) {
                processingItems.push({ text: line, context: block.gender, blockId: `b${blockIdx}`, lineIndex: lineIdx });
              }
            });
          });

          const totalItems = processingItems.length;
          const BATCH_SIZE = 15;
          const correctionsToReview: PendingReview['items'] = [];

          setProgress(prev => ({ ...prev, fileIndex: fIndex, langIndex: lIndex, blocksTotal: totalItems, blocksSent: 0, currentFileName: currentFile.name }));

          if (totalItems > 0) {
            for (let i = 0; i < totalItems; i += BATCH_SIZE) {
              if (stopProcessingRef.current) { setStatus('stopped'); return; }

              const batch = processingItems.slice(i, i + BATCH_SIZE);
              const apiRequests = batch.map(item => ({ text: item.text, context: item.context }));
              
              // Call API
              const results: BatchResponse[] = await gemini.translateBatch(apiRequests, currentLang, mode, shlokaMode, sanskritMode);
              
              // CRITICAL: Check stop AFTER await to prevent processing delayed results
              if (stopProcessingRef.current) { setStatus('stopped'); return; }

              batch.forEach((item, idx) => {
                const res = results[idx];
                const blockIdx = parseInt(item.blockId.substring(1));
                
                // Directly apply text first
                if (res) {
                    baseTargetBlocks[blockIdx].lines[item.lineIndex] = res.text;
                    
                    // If in convert mode and corrected, add to review list
                    if (mode === 'convert_encoding' && res.metadata?.wasCorrected) {
                        correctionsToReview.push({
                            blockId: item.blockId,
                            lineIndex: item.lineIndex,
                            originalDecoded: res.metadata.originalDecoded || "N/A",
                            suggestedText: res.text,
                            reason: res.metadata.reason || "Grammar/Fact check",
                            source: res.metadata.source || "Google Search"
                        });
                    }
                }
              });

              setProgress(prev => ({ ...prev, blocksSent: Math.min(i + BATCH_SIZE, totalItems) }));
            }
          }

          // Define how to finalize output
          const finalizeOutput = (reviewedItems: Record<string, string> = {}) => {
             // Apply reviews if any
             if (Object.keys(reviewedItems).length > 0) {
                 correctionsToReview.forEach(c => {
                    const key = `${c.blockId}-${c.lineIndex}`;
                    if (reviewedItems[key]) {
                        const blockIdx = parseInt(c.blockId.substring(1));
                        baseTargetBlocks[blockIdx].lines[c.lineIndex] = reviewedItems[key];
                    }
                 });
             }

             let finalOutput = preamble.trimEnd();
             if (baseTargetBlocks.length > 0) {
                if (finalOutput.length > 0) finalOutput += '\n\n';
                baseTargetBlocks.forEach((block, idx) => {
                  finalOutput += `${block.header}\n${block.lines.join('\n').trimEnd()}`;
                  if (idx < baseTargetBlocks.length - 1) finalOutput += '\n\n';
                });
             }
             const outputKey = `${currentFile.id}_${currentLang}`;
             setOutputs(prev => ({ ...prev, [outputKey]: finalOutput }));
             
             // Auto download conditional check
             if (autoDownload) {
                triggerDownload(generateFileName(currentFile.name, currentLang), finalOutput);
             }
          };

          // If we have corrections, pause for review
          if (correctionsToReview.length > 0) {
             setReviewData({
                 fileId: currentFile.id,
                 lang: currentLang,
                 items: correctionsToReview,
                 finalOutputBuilder: finalizeOutput
             });
             setStatus('done'); // Technically done processing, waiting for review
             return; // Stop loop to show modal, user will trigger finalize
          } else {
             finalizeOutput();
          }
        }
      }
      
      if (!stopProcessingRef.current) {
        setStatus('done');
        setProgress(prev => ({ ...prev, blocksSent: prev.blocksTotal }));
      }
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || "An unexpected error occurred.");
    }
  };

  const finishReview = (acceptedCorrections: Record<string, string>) => {
      if (reviewData) {
          reviewData.finalOutputBuilder(acceptedCorrections);
          setReviewData(null);
      }
  };

  const getActiveOutputContent = () => {
    const file = files.find(f => f.id === activeFileId);
    if (!file) return '';
    for (const lang of selectedLangs) {
        const key = `${file.id}_${lang}`;
        if (outputs[key]) return outputs[key];
    }
    const anyKey = Object.keys(outputs).find(k => k.startsWith(file.id + '_'));
    return anyKey ? outputs[anyKey] : '';
  };

  return (
    <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
      
      {/* --- Top Bar --- */}
      <header className="bg-gray-900 border-b border-gray-800 p-3 shrink-0 flex items-center justify-between shadow-lg z-20">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-indigo-900/20 shadow-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100 tracking-tight leading-none font-serif">AstroLocalize</h1>
            <p className="text-[10px] text-indigo-400 font-medium tracking-wide">AI TRANSLATION & CORRECTION</p>
          </div>
        </div>
        
        {/* Central Progress */}
        {status === 'processing' && (
           <div className="flex items-center gap-4 bg-gray-800 px-4 py-1.5 rounded-full border border-gray-700 shadow-inner">
               <span className="text-xs text-indigo-300 font-mono">
                   {progress.currentFileName}
               </span>
               <div className="w-32 bg-gray-700 rounded-full h-1.5">
                   <div className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${progress.blocksTotal > 0 ? (progress.blocksSent / progress.blocksTotal) * 100 : 0}%` }}
                   ></div>
               </div>
           </div>
        )}
        
         <div className="flex items-center gap-2">
            <label className="cursor-pointer text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 px-4 py-2 rounded-md transition-all flex items-center gap-2 font-medium shadow-sm">
                <Upload className="w-3.5 h-3.5" />
                Import Files
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.res,.dat" multiple />
            </label>
         </div>
      </header>

      {/* --- Toolbar --- */}
      <div className="bg-gray-900 border-b border-gray-800 p-4 shrink-0 flex flex-col gap-4 shadow-xl z-30">
         
         {/* Top Row: Primary Controls */}
         <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            
            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                {/* Mode Tabs */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:block">Action</span>
                    <div className="flex bg-black rounded-lg p-1 border border-gray-700 shadow-sm">
                        {[
                            { id: 'translate', label: 'Translate', icon: Languages, color: 'bg-indigo-600' },
                            { id: 'rewrite', label: 'Rewrite', icon: Wand2, color: 'bg-teal-600' },
                            { id: 'convert_encoding', label: 'Fix KrutiDev', icon: TypeIcon, color: 'bg-orange-600' }
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => setMode(m.id as ProcessingMode)}
                                className={`px-3 sm:px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${
                                    mode === m.id ? `${m.color} text-white shadow-md` : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                                }`}
                            >
                                <m.icon className="w-3.5 h-3.5" /> 
                                <span className={mode === m.id ? 'block' : 'hidden sm:block'}>{m.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-8 w-px bg-gray-800 hidden lg:block"></div>

                {/* Language Trigger */}
                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:block">Target</span>
                    <button 
                        onClick={() => setIsLangModalOpen(true)}
                        className="flex-1 sm:flex-none flex items-center justify-between sm:justify-start gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-md text-xs border border-gray-600 text-gray-300 transition-colors shadow-sm min-w-[140px]"
                    >
                        <div className="flex items-center gap-2">
                            <Languages className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{selectedLangs.length} Language{selectedLangs.length !== 1 ? 's' : ''}</span>
                        </div>
                        <CheckCircle2 className="w-3 h-3 text-gray-500" />
                    </button>
                </div>
            </div>

            {/* Start Button (Desktop Position) */}
            <div className="hidden lg:block">
                 {status === 'processing' ? (
                    <Button 
                        variant="ghost" 
                        className="bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-900/50 h-10 px-6 text-xs font-semibold tracking-wide" 
                        onClick={() => {
                            stopProcessingRef.current = true;
                            setStatus('stopped'); 
                        }}
                    >
                        <XCircle className="w-4 h-4 mr-2" /> STOP PROCESSING
                    </Button>
                 ) : (
                    <Button 
                        className={`h-10 px-8 text-xs font-bold tracking-wide shadow-lg transition-transform active:scale-95 flex items-center gap-2 ${
                            mode === 'convert_encoding' 
                                ? 'bg-orange-600 hover:bg-orange-500 shadow-orange-900/20 border-orange-500' 
                                : mode === 'rewrite'
                                ? 'bg-teal-600 hover:bg-teal-500 shadow-teal-900/20 border-teal-500'
                                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20 border-indigo-500'
                        }`} 
                        onClick={handleProcess} 
                        disabled={files.length === 0}
                    >
                       {mode === 'convert_encoding' ? <RefreshCw className="w-4 h-4"/> : <Sparkles className="w-4 h-4"/>}
                       {mode === 'convert_encoding' ? 'START CONVERSION' : mode === 'rewrite' ? 'START REWRITE' : 'START TRANSLATION'}
                    </Button>
                 )}
            </div>
         </div>

         {/* Bottom Row: Options Toggles */}
         <div className="flex flex-wrap items-center gap-2 bg-gray-800/30 p-2 rounded-lg border border-gray-800">
             <div className="flex items-center gap-2 px-2 border-r border-gray-700 mr-1">
                 <Settings2 className="w-3.5 h-3.5 text-gray-500" />
                 <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Options</span>
             </div>

             {/* Toggles Group */}
             <div className="flex flex-wrap items-center gap-2 flex-1">
                 {/* Dual Sex Toggle */}
                 <button 
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                        dualSexMode ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-200' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                    onClick={() => setDualSexMode(!dualSexMode)}
                    title="Generate Male and Female versions for every block"
                 >
                    <Split className="w-3.5 h-3.5" />
                    Dual Sex
                    {dualSexMode && <Check className="w-3 h-3 ml-1" />}
                 </button>

                 {/* Shloka Mode */}
                 <button 
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                        shlokaMode && !sanskritMode ? 'bg-purple-900/40 border-purple-500/50 text-purple-200' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                    onClick={() => {
                       setShlokaMode(!shlokaMode);
                       if (!shlokaMode) setSanskritMode(false);
                    }}
                    title="Write Shlokas in target language script (e.g. Hinglish)"
                 >
                    <Scroll className="w-3.5 h-3.5" />
                    Transliterate Shlokas
                    {shlokaMode && !sanskritMode && <Check className="w-3 h-3 ml-1" />}
                 </button>

                 {/* Sanskrit Mode */}
                 <button 
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                        sanskritMode ? 'bg-pink-900/40 border-pink-500/50 text-pink-200' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                    onClick={() => {
                        setSanskritMode(!sanskritMode);
                        if (!sanskritMode) setShlokaMode(false);
                    }}
                    title="Always keep Shlokas in Sanskrit Devanagari script"
                 >
                    <BookOpen className="w-3.5 h-3.5" />
                    Preserve Sanskrit
                    {sanskritMode && <Check className="w-3 h-3 ml-1" />}
                 </button>

                 {/* Yoga Mode */}
                 <button 
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                        yogaMode ? 'bg-amber-900/40 border-amber-500/50 text-amber-200' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                    onClick={() => setYogaMode(!yogaMode)}
                    title="Only process blocks with PopularityFlag=1"
                 >
                    <Filter className="w-3.5 h-3.5" />
                    Yoga Filter
                    {yogaMode && <Check className="w-3 h-3 ml-1" />}
                 </button>
             </div>

             {/* Auto Download */}
             <div className="flex items-center border-l border-gray-700 pl-3 ml-auto">
                 <button 
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                        autoDownload ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-200' : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                    onClick={() => setAutoDownload(!autoDownload)}
                 >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Auto Save</span>
                    {autoDownload && <span className="sm:hidden text-emerald-400">●</span>}
                 </button>
             </div>
         </div>

         {/* Mobile Action Button */}
         <div className="lg:hidden">
             {status === 'processing' ? (
                <Button 
                    variant="ghost" 
                    className="w-full bg-red-900/20 text-red-400 border border-red-900/50 h-10 text-xs font-bold" 
                    onClick={() => { stopProcessingRef.current = true; setStatus('stopped'); }}
                >
                    STOP PROCESSING
                </Button>
             ) : (
                <Button 
                    className={`w-full h-10 text-xs font-bold tracking-wide shadow-lg ${
                         mode === 'convert_encoding' ? 'bg-orange-600' : mode === 'rewrite' ? 'bg-teal-600' : 'bg-indigo-600'
                    }`} 
                    onClick={handleProcess} 
                    disabled={files.length === 0}
                >
                    {mode === 'convert_encoding' ? 'START CONVERSION' : mode === 'rewrite' ? 'START REWRITE' : 'START TRANSLATION'}
                </Button>
             )}
         </div>
      </div>

      {/* --- Main Content Split --- */}
      <div className="flex-1 flex overflow-hidden">
          {/* Left: Source */}
          <div className="flex-1 flex flex-col border-r border-gray-800 bg-gray-900/50">
              <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex justify-between items-center shrink-0">
                  <div className="flex gap-1 overflow-x-auto custom-scrollbar max-w-[70%]">
                      {files.map(file => (
                          <button
                            key={file.id}
                            onClick={() => setActiveFileId(file.id)}
                            className={`px-3 py-1 rounded text-xs whitespace-nowrap transition-colors border-b-2 ${
                                activeFileId === file.id ? 'border-indigo-500 text-indigo-400 bg-gray-800' : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                          >
                              {file.name}
                          </button>
                      ))}
                  </div>
                  <span className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">Source</span>
              </div>
              <textarea 
                className="flex-1 w-full bg-transparent p-6 text-sm font-mono text-gray-400 resize-none focus:outline-none focus:bg-gray-900/50 custom-scrollbar leading-relaxed"
                value={files.find(f => f.id === activeFileId)?.content || ''}
                onChange={(e) => {
                    const val = e.target.value;
                    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: val } : f));
                }}
                spellCheck={false}
              />
          </div>

          {/* Right: Output */}
          <div className="flex-1 flex flex-col bg-black">
               <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">
                          Result {Object.keys(outputs).length > 0 && <span className="text-indigo-500">• Ready</span>}
                      </span>
                  </div>
                  <button 
                    onClick={() => {
                        const content = getActiveOutputContent();
                        if (content) triggerDownload('result.txt', content);
                    }}
                    disabled={!getActiveOutputContent()}
                    className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                  >
                      <Download className="w-4 h-4" />
                  </button>
              </div>
              <textarea 
                className={`flex-1 w-full bg-transparent p-6 text-sm font-mono resize-none focus:outline-none focus:bg-gray-900/50 custom-scrollbar leading-relaxed ${
                    mode === 'convert_encoding' ? 'text-orange-100' : 'text-gray-200'
                }`}
                value={getActiveOutputContent()}
                readOnly
                placeholder="Processed output will appear here."
              />
          </div>
      </div>

      {/* --- Language Selection Modal --- */}
      {isLangModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                  <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <Languages className="w-5 h-5 text-indigo-500" /> Select Target Languages
                      </h2>
                      <button onClick={() => setIsLangModalOpen(false)} className="text-gray-500 hover:text-white">
                          <XCircle className="w-5 h-5" />
                      </button>
                  </div>
                  <div className="p-4 overflow-y-auto custom-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {LANGUAGES.map(lang => {
                          const isSelected = selectedLangs.includes(lang.value);
                          return (
                              <button
                                  key={lang.value}
                                  onClick={() => toggleLanguage(lang.value)}
                                  className={`flex items-center gap-3 px-3 py-3 rounded-lg border text-sm text-left transition-all ${
                                      isSelected 
                                      ? 'bg-indigo-900/30 border-indigo-600/50 text-indigo-200' 
                                      : 'bg-black border-gray-800 text-gray-400 hover:border-gray-600'
                                  }`}
                              >
                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-600'}`}>
                                      {isSelected && <Check className="w-3 h-3 text-black" />}
                                  </div>
                                  <span className="font-medium">{lang.label}</span>
                              </button>
                          );
                      })}
                  </div>
                  <div className="p-4 border-t border-gray-800 flex justify-end">
                      <Button onClick={() => setIsLangModalOpen(false)} className="bg-indigo-600 hover:bg-indigo-500 text-white">Done</Button>
                  </div>
              </div>
          </div>
      )}

      {/* --- Review Corrections Modal (Human Feedback Loop) --- */}
      {reviewData && (
        <ReviewModal 
            data={reviewData} 
            onFinish={finishReview} 
            onCancel={() => {
                setReviewData(null);
                setStatus('idle');
            }} 
        />
      )}
      
      {errorMsg && (
          <div className="absolute bottom-4 right-4 bg-red-900/90 text-white px-4 py-3 rounded-lg shadow-2xl border border-red-700 flex items-center gap-3 z-50">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} className="ml-2 hover:text-red-200">✕</button>
          </div>
      )}
    </div>
  );
}

// Sub-component for Review Modal to keep App clean
const ReviewModal = ({ data, onFinish, onCancel }: { 
    data: PendingReview, 
    onFinish: (r: Record<string, string>) => void,
    onCancel: () => void 
}) => {
    const [decisions, setDecisions] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        data.items.forEach(item => {
            initial[`${item.blockId}-${item.lineIndex}`] = item.suggestedText;
        });
        return initial;
    });

    const toggleDecision = (key: string, useOriginal: boolean, original: string, suggested: string) => {
        setDecisions(prev => ({
            ...prev,
            [key]: useOriginal ? original : suggested
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-indigo-600/30 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-900 rounded-t-xl">
                    <div>
                        <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
                            <Search className="w-5 h-5" /> Review AI Corrections
                        </h2>
                        <p className="text-gray-400 text-xs mt-1">
                            The AI detected potential errors in the KrutiDev conversion. Please verify using the provided sources.
                        </p>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-black">
                    {data.items.map((item, idx) => {
                        const key = `${item.blockId}-${item.lineIndex}`;
                        const isUsingOriginal = decisions[key] === item.originalDecoded;

                        return (
                            <div key={idx} className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-md transition-all hover:border-gray-700">
                                <div className="flex items-start gap-3 mb-3">
                                    <AlertTriangle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-gray-200">Correction Reason: <span className="text-indigo-400 font-normal">{item.reason}</span></h4>
                                        {item.source && (
                                            <a href={item.source} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline block mt-1">
                                                Verify Source: {item.source}
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Option A: Raw Decoding */}
                                    <div 
                                        onClick={() => toggleDecision(key, true, item.originalDecoded, item.suggestedText)}
                                        className={`p-3 rounded border cursor-pointer relative ${
                                            isUsingOriginal ? 'bg-gray-800 border-gray-500' : 'bg-black border-gray-800 opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Original Raw Decoding</div>
                                        <div className="text-sm font-mono text-gray-300 break-words">{item.originalDecoded}</div>
                                        {isUsingOriginal && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-gray-400" />}
                                    </div>

                                    {/* Option B: AI Correction */}
                                    <div 
                                        onClick={() => toggleDecision(key, false, item.originalDecoded, item.suggestedText)}
                                        className={`p-3 rounded border cursor-pointer relative ${
                                            !isUsingOriginal ? 'bg-indigo-900/20 border-indigo-500 ring-1 ring-indigo-500/20' : 'bg-black border-gray-800 opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        <div className="text-[10px] uppercase font-bold text-indigo-500 mb-2">AI Suggested Correction</div>
                                        <div className="text-sm font-mono text-indigo-100 break-words">{item.suggestedText}</div>
                                        {!isUsingOriginal && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-indigo-500" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-5 border-t border-gray-800 bg-gray-900 rounded-b-xl flex justify-end gap-3">
                    <Button variant="ghost" onClick={onCancel}>Cancel All</Button>
                    <Button onClick={() => onFinish(decisions)} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                        Apply Selected Changes
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default App;