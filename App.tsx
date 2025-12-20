import React, { useState, useRef } from 'react';
import { Upload, Download, Languages, FileText, Split, ArrowRightLeft, Sparkles, Wand2, XCircle, CheckCircle2, Files, RefreshCw } from 'lucide-react';
import { LANGUAGES } from './constants';
import { TargetLanguage, ProcessingMode, ProcessingItem } from './types';
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
Mars is aspecting the 7th house. Your spouse will be supportive.
Chant Om Shang Shaneshcharaay Namah for peace.

#* Planet=0,House=0,GoodBad=0
##*Text
v©"kf/k ef.k  ea=k.kka]  xzg&u{k=  rkfjdk A
ÒkX;dkys ÒosfRlf)% vÒkX;a fu"Qya Òosr AA`;

interface FileData {
  name: string;
  content: string;
  id: string;
}

function App() {
  // State for multiple files
  const [files, setFiles] = useState<FileData[]>([
    { name: 'Default_Example.txt', content: DEFAULT_CONTENT, id: 'default' }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('default');

  // Dictionary to store output per language. Key structure: "fileId_langCode"
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [activeOutputTab, setActiveOutputTab] = useState<string>('');
  
  const [selectedLangs, setSelectedLangs] = useState<string[]>([TargetLanguage.Hindi]);
  const [mode, setMode] = useState<ProcessingMode>('translate');
  const [dualSexMode, setDualSexMode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'stopped' | 'error'>('idle');
  
  // Detailed Progress Stats
  const [progress, setProgress] = useState({
    fileIndex: 0,
    totalFiles: 0,
    langIndex: 0,
    totalLangs: 0,
    blocksSent: 0,
    blocksTotal: 0,
    currentFileName: ''
  });
  
  const [errorMsg, setErrorMsg] = useState('');

  // Ref to handle stopping the process
  const stopProcessingRef = useRef(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const newFiles: FileData[] = [];
    let processedCount = 0;

    (Array.from(fileList) as File[]).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        newFiles.push({
          name: file.name,
          content: text,
          id: Math.random().toString(36).substr(2, 9)
        });
        processedCount++;
        
        if (processedCount === fileList.length) {
          setFiles(newFiles);
          setActiveFileId(newFiles[0].id);
          // Reset outputs when new files are loaded
          setOutputs({});
        }
      };
      reader.readAsText(file);
    });
  };

  const updateActiveFileContent = (newContent: string) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newContent } : f));
  };

  const getActiveFileContent = () => {
    return files.find(f => f.id === activeFileId)?.content || '';
  };

  const toggleLanguage = (langValue: string) => {
    setSelectedLangs(prev => {
      if (prev.includes(langValue)) {
        if (prev.length === 1) return prev;
        return prev.filter(l => l !== langValue);
      }
      return [...prev, langValue];
    });
  };

  const handleStop = () => {
    stopProcessingRef.current = true;
    setStatus('stopped');
  };

  // Trigger browser download
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
    // Input: MyFile.txt -> Output: MyFile_translated_hindi_standard.txt
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
    const modeStr = dualSexMode ? 'dual_sex' : 'standard';
    const langLabel = LANGUAGES.find(l => l.value === lang)?.label.split(' ')[0].toLowerCase() || lang.toLowerCase();
    
    return `${nameWithoutExt}_translated_${langLabel}_${modeStr}.txt`;
  };

  const handleProcess = async () => {
    stopProcessingRef.current = false;
    setStatus('processing');
    setOutputs({});
    setErrorMsg('');
    
    // Initial Progress State
    setProgress({
      fileIndex: 0,
      totalFiles: files.length,
      langIndex: 0,
      totalLangs: selectedLangs.length,
      blocksSent: 0,
      blocksTotal: 0,
      currentFileName: ''
    });

    try {
      // Use API Key from environment variable
      const gemini = new GeminiService(process.env.API_KEY!);

      // --- Loop through Files ---
      for (let fIndex = 0; fIndex < files.length; fIndex++) {
        if (stopProcessingRef.current) break;
        
        const currentFile = files[fIndex];
        
        // --- Loop through Languages ---
        for (let lIndex = 0; lIndex < selectedLangs.length; lIndex++) {
          if (stopProcessingRef.current) break;

          const currentLang = selectedLangs[lIndex];
          const { preamble, blocks } = parseInputFile(currentFile.content);

          // Step 1: Expand blocks based on Dual Sex Mode
          interface TargetBlock {
            header: string;
            lines: string[]; 
            gender: 'Male' | 'Female' | 'Neutral';
          }

          const baseTargetBlocks: TargetBlock[] = [];

          blocks.forEach(block => {
            if (dualSexMode) {
              baseTargetBlocks.push({
                header: updateHeaderSex(block.header, 0),
                lines: [...block.contentLines],
                gender: 'Male'
              });
              baseTargetBlocks.push({
                header: updateHeaderSex(block.header, 1),
                lines: [...block.contentLines],
                gender: 'Female'
              });
            } else {
              const gender = getGenderFromHeader(block.header);
              baseTargetBlocks.push({
                header: block.header,
                lines: [...block.contentLines],
                gender
              });
            }
          });

          // Step 2: Identify items
          const processingItems: ProcessingItem[] = [];
          baseTargetBlocks.forEach((block, blockIdx) => {
            const translatableMap = identifyTranslatableLines(block.lines);
            block.lines.forEach((line, lineIdx) => {
              if (translatableMap[lineIdx]) {
                processingItems.push({
                  text: line,
                  context: block.gender,
                  blockId: `b${blockIdx}`,
                  lineIndex: lineIdx
                });
              }
            });
          });

          const totalItems = processingItems.length;
          const BATCH_SIZE = 15;

          // Update Progress Start for this file/lang
          setProgress(prev => ({
            ...prev,
            fileIndex: fIndex,
            langIndex: lIndex,
            blocksTotal: totalItems,
            blocksSent: 0,
            currentFileName: currentFile.name
          }));

          // --- Process Batches ---
          if (totalItems > 0) {
            for (let i = 0; i < totalItems; i += BATCH_SIZE) {
              if (stopProcessingRef.current) {
                setStatus('stopped');
                return;
              }

              const batch = processingItems.slice(i, i + BATCH_SIZE);
              
              const apiRequests = batch.map(item => ({
                text: item.text,
                context: item.context
              }));

              const results = await gemini.translateBatch(apiRequests, currentLang, mode);
              
              batch.forEach((item, idx) => {
                const blockIdx = parseInt(item.blockId.substring(1));
                if (results[idx] !== undefined) {
                   baseTargetBlocks[blockIdx].lines[item.lineIndex] = results[idx];
                }
              });

              // Update Progress
              setProgress(prev => ({
                ...prev,
                blocksSent: Math.min(i + BATCH_SIZE, totalItems)
              }));
            }
          }

          // Reconstruct File
          let finalOutput = preamble.trimEnd();
          if (baseTargetBlocks.length > 0) {
            if (finalOutput.length > 0) finalOutput += '\n\n';
            baseTargetBlocks.forEach((block, idx) => {
              const blockContent = block.lines.join('\n').trimEnd();
              finalOutput += `${block.header}\n${blockContent}`;
              if (idx < baseTargetBlocks.length - 1) finalOutput += '\n\n';
            });
          }

          // Save Output to State
          const outputKey = `${currentFile.id}_${currentLang}`;
          setOutputs(prev => ({ ...prev, [outputKey]: finalOutput }));
          
          if (fIndex === 0 && lIndex === 0) {
            setActiveOutputTab(outputKey);
          }

          // Auto Download
          const downloadName = generateFileName(currentFile.name, currentLang);
          triggerDownload(downloadName, finalOutput);
        }
      }

      if (!stopProcessingRef.current) {
        setStatus('done');
        // Ensure progress shows 100%
        setProgress(prev => ({ ...prev, blocksSent: prev.blocksTotal }));
      }

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || "An unexpected error occurred.");
    }
  };

  const handleManualDownload = (fileId: string, lang: string) => {
    const key = `${fileId}_${lang}`;
    const content = outputs[key];
    const file = files.find(f => f.id === fileId);
    if (!content || !file) return;

    const downloadName = generateFileName(file.name, lang);
    triggerDownload(downloadName, content);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">AstroLocalize</h1>
              <p className="text-xs text-gray-400">Astrology Software Localization Tool</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
             {/* API Key management removed as per guidelines */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 gap-6 flex flex-col lg:flex-row">
        
        {/* Left Column: Input */}
        <div className="flex-1 flex flex-col gap-4 min-h-[500px]">
          <div className="bg-gray-900 rounded-xl border border-gray-800 flex flex-col h-full shadow-xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-200">
                  {files.length > 1 ? `${files.length} Files Queued` : 'Source File'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-md transition-colors border border-gray-700 flex items-center gap-2">
                  <Upload className="w-3 h-3" />
                  Select Files
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.res,.dat" multiple />
                </label>
              </div>
            </div>

            {/* File Tabs if multiple */}
            {files.length > 0 && (
              <div className="flex px-2 bg-gray-900 border-b border-gray-800 gap-1 overflow-x-auto custom-scrollbar">
                {files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`px-3 py-2 text-xs max-w-[150px] truncate border-b-2 transition-colors ${
                      activeFileId === file.id
                        ? 'border-indigo-500 text-indigo-400 bg-gray-800/50'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {file.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 relative">
              <textarea 
                className="w-full h-full bg-gray-950 p-4 text-sm font-mono text-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-900/50 custom-scrollbar"
                value={getActiveFileContent()}
                onChange={(e) => updateActiveFileContent(e.target.value)}
                spellCheck={false}
                placeholder="Paste your source file content here..."
              />
            </div>
            <div className="p-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 text-right">
               {files.length} File(s) | Current: {getActiveFileContent().split('\n').length} Lines
            </div>
          </div>
        </div>

        {/* Middle Column: Controls */}
        <div className="lg:w-80 flex flex-col gap-6 justify-center">
          
          <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-xl space-y-6">
            
            {/* Mode Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Wand2 className="w-4 h-4" /> Processing Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                 <button
                   onClick={() => setMode('translate')}
                   className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                     mode === 'translate' 
                     ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                     : 'bg-gray-950 border-gray-700 text-gray-400 hover:bg-gray-800'
                   }`}
                 >
                   Translate
                 </button>
                 <button
                   onClick={() => setMode('rewrite')}
                   className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                     mode === 'rewrite' 
                     ? 'bg-teal-600 border-teal-500 text-white shadow-lg' 
                     : 'bg-gray-950 border-gray-700 text-gray-400 hover:bg-gray-800'
                   }`}
                 >
                   Rewrite/Fix
                 </button>
              </div>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4" /> Target Languages
                </div>
                <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded-full text-gray-400">
                    {selectedLangs.length} Selected
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {LANGUAGES.map(lang => {
                  const isSelected = selectedLangs.includes(lang.value);
                  return (
                    <button
                        key={lang.value}
                        onClick={() => toggleLanguage(lang.value)}
                        className={`flex items-center gap-2 px-2 py-2 rounded-md border text-xs text-left transition-all ${
                            isSelected 
                            ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-200' 
                            : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'
                        }`}
                    >
                        {isSelected ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-gray-600 flex-shrink-0" />
                        )}
                        <span className="truncate">{lang.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dual Sex Toggle */}
            <div className="space-y-3">
               <label className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Split className="w-4 h-4" /> Output Structure
              </label>
              <div 
                className="bg-gray-950 p-1 rounded-lg border border-gray-700 flex relative cursor-pointer"
                onClick={() => setDualSexMode(!dualSexMode)}
              >
                <div className={`flex-1 py-2 text-xs text-center font-medium rounded-md transition-all ${!dualSexMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400'}`}>
                  Standard
                </div>
                <div className={`flex-1 py-2 text-xs text-center font-medium rounded-md transition-all ${dualSexMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400'}`}>
                  Dual Sex
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">
                Dual Sex mode creates explicit Male (Sex=0) and Female (Sex=1) blocks for every input block.
              </p>
            </div>

            <hr className="border-gray-800" />

            {/* Action Buttons */}
            <div className="space-y-3">
                {status === 'processing' ? (
                    <Button 
                        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white focus:ring-red-500" 
                        onClick={handleStop}
                    >
                        <XCircle className="w-4 h-4 mr-2" /> Stop Processing
                    </Button>
                ) : (
                    <Button 
                        className="w-full py-3" 
                        onClick={handleProcess}
                        disabled={files.length === 0}
                        variant={mode === 'rewrite' ? 'secondary' : 'primary'}
                    >
                        {mode === 'rewrite' ? 'Start Rewrite' : 'Start Translation'}
                    </Button>
                )}

                {/* Progress Bar & Stats */}
                {status === 'processing' && (
                  <div className="space-y-3 bg-gray-950/50 p-3 rounded-lg border border-gray-800">
                    
                    {/* File Info */}
                    <div className="flex items-center gap-2 text-xs text-indigo-300">
                       <Files className="w-3 h-3" />
                       <span className="truncate max-w-[180px]">File {progress.fileIndex + 1}/{progress.totalFiles}: {progress.currentFileName}</span>
                    </div>

                    {/* Language Info */}
                    <div className="flex items-center gap-2 text-xs text-indigo-300">
                       <Languages className="w-3 h-3" />
                       <span>Lang: {LANGUAGES.find(l => l.value === selectedLangs[progress.langIndex])?.label.split(' ')[0]}</span>
                    </div>

                    {/* Blocks Counter */}
                    <div className="flex justify-between items-center text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Blocks Sent: {progress.blocksSent} / {progress.blocksTotal}
                      </span>
                      <span className="font-mono text-indigo-400">
                         {progress.blocksTotal > 0 ? Math.round((progress.blocksSent / progress.blocksTotal) * 100) : 0}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${mode === 'rewrite' ? 'bg-teal-500' : 'bg-indigo-500'}`}
                          style={{ width: `${progress.blocksTotal > 0 ? (progress.blocksSent / progress.blocksTotal) * 100 : 0}%` }}
                        ></div>
                    </div>
                  </div>
                )}

                {status === 'stopped' && (
                    <div className="p-3 bg-yellow-900/20 border border-yellow-900/50 rounded-lg text-xs text-yellow-400 text-center">
                        Process stopped by user.
                    </div>
                )}

                {status === 'error' && (
                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-xs text-red-400">
                    {errorMsg}
                </div>
                )}
            </div>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="flex-1 flex flex-col gap-4 min-h-[500px]">
          <div className="bg-gray-900 rounded-xl border border-gray-800 flex flex-col h-full shadow-xl overflow-hidden">
            
            {/* Output Header with Tabs */}
            <div className="border-b border-gray-800 bg-gray-900/50 flex flex-col">
                <div className="p-4 flex justify-between items-center pb-2">
                    <div className="flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
                        <span className="font-medium text-gray-200">Results (Auto-Downloading)</span>
                    </div>
                    {activeOutputTab && outputs[activeOutputTab] && (
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={() => {
                              const [fId, lCode] = activeOutputTab.split('_');
                              handleManualDownload(fId, lCode);
                            }} 
                            className="gap-2"
                        >
                            <Download className="w-4 h-4" /> Download Again
                        </Button>
                    )}
                </div>
                
                {/* Result Tabs */}
                {Object.keys(outputs).length > 0 && (
                    <div className="flex px-4 gap-2 overflow-x-auto custom-scrollbar pb-0">
                        {Object.keys(outputs).map(key => {
                            const [fId, lang] = key.split('_');
                            const file = files.find(f => f.id === fId);
                            const langLabel = LANGUAGES.find(l => l.value === lang)?.label.split(' ')[0] || lang;
                            const displayName = `${file?.name.substring(0, 8)}.. - ${langLabel}`;

                            return (
                              <button
                                  key={key}
                                  onClick={() => setActiveOutputTab(key)}
                                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                                      activeOutputTab === key 
                                      ? 'border-indigo-500 text-indigo-400 bg-gray-800/50 rounded-t-md' 
                                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30 rounded-t-md'
                                  }`}
                                  title={`${file?.name} - ${langLabel}`}
                              >
                                  {displayName}
                              </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex-1 relative">
              <textarea 
                className="w-full h-full bg-gray-950 p-4 text-sm font-mono text-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-teal-900/50 custom-scrollbar"
                value={activeOutputTab ? outputs[activeOutputTab] : ''}
                readOnly
                placeholder={status === 'processing' ? "Processing files... Please wait." : "Results will appear here."}
              />
            </div>
            
            <div className="p-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 text-right">
              {activeOutputTab && outputs[activeOutputTab] 
                ? `Lines: ${outputs[activeOutputTab].split('\n').length}` 
                : 'Waiting...'}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;