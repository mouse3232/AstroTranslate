import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Languages, FileText, Split, ArrowRightLeft, Key, Sparkles, Wand2, XCircle, CheckCircle2, Square } from 'lucide-react';
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

function App() {
  const [inputContent, setInputContent] = useState(DEFAULT_CONTENT);
  // Dictionary to store output per language
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [activeOutputTab, setActiveOutputTab] = useState<string>('');
  
  const [selectedLangs, setSelectedLangs] = useState<string[]>([TargetLanguage.Hindi]);
  const [mode, setMode] = useState<ProcessingMode>('translate');
  const [dualSexMode, setDualSexMode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'stopped' | 'error'>('idle');
  
  // Progress tracking: current language index and percentage within that language
  const [currentLangIndex, setCurrentLangIndex] = useState(0);
  const [batchProgress, setBatchProgress] = useState(0);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [apiKey, setApiKey] = useState(process.env.API_KEY || '');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Ref to handle stopping the process
  const stopProcessingRef = useRef(false);

  useEffect(() => {
    if (!process.env.API_KEY) {
      const storedKey = localStorage.getItem('gemini_api_key');
      if (storedKey) {
        setApiKey(storedKey);
      } else {
        setShowApiKeyModal(true);
      }
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setInputContent(text);
    };
    reader.readAsText(file);
  };

  const toggleLanguage = (langValue: string) => {
    setSelectedLangs(prev => {
      if (prev.includes(langValue)) {
        // Don't allow deselecting if it's the only one
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

  const handleProcess = async () => {
    if (!apiKey) {
      setShowApiKeyModal(true);
      return;
    }
    
    stopProcessingRef.current = false;
    setStatus('processing');
    setOutputs({});
    setErrorMsg('');
    setCurrentLangIndex(0);
    setBatchProgress(0);

    try {
      const gemini = new GeminiService(apiKey);
      const { preamble, blocks } = parseInputFile(inputContent);
      
      // Step 1: Expand blocks based on Dual Sex Mode
      interface TargetBlock {
        header: string;
        lines: string[]; 
        gender: 'Male' | 'Female' | 'Neutral';
      }

      const baseTargetBlocks: TargetBlock[] = [];

      blocks.forEach(block => {
        if (dualSexMode) {
          // Block 1: Male (Sex=0)
          baseTargetBlocks.push({
            header: updateHeaderSex(block.header, 0),
            lines: [...block.contentLines],
            gender: 'Male'
          });
          
          // Block 2: Female (Sex=1)
          baseTargetBlocks.push({
            header: updateHeaderSex(block.header, 1),
            lines: [...block.contentLines],
            gender: 'Female'
          });
        } else {
          // Single mode
          const gender = getGenderFromHeader(block.header);
          baseTargetBlocks.push({
            header: block.header,
            lines: [...block.contentLines],
            gender
          });
        }
      });

      // Step 2: Identify all items that need processing
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
      
      // --- Loop through each selected language ---
      for (let lIndex = 0; lIndex < selectedLangs.length; lIndex++) {
        const currentLang = selectedLangs[lIndex];
        
        if (stopProcessingRef.current) break;
        
        setCurrentLangIndex(lIndex);
        setBatchProgress(0);

        // Deep copy the blocks structure for this language
        const currentBlocks = JSON.parse(JSON.stringify(baseTargetBlocks));

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
            
            // Apply translations to the currentBlocks structure
            batch.forEach((item, idx) => {
              const blockIdx = parseInt(item.blockId.substring(1));
              if (results[idx] !== undefined) {
                 currentBlocks[blockIdx].lines[item.lineIndex] = results[idx];
              }
            });

            setBatchProgress(Math.round(((i + BATCH_SIZE) / totalItems) * 100));
          }
        }

        // Reconstruct File for this language
        let finalOutput = preamble.trimEnd();

        if (currentBlocks.length > 0) {
          if (finalOutput.length > 0) {
              finalOutput += '\n\n';
          }

          currentBlocks.forEach((block: TargetBlock, idx: number) => {
            const blockContent = block.lines.join('\n').trimEnd();
            const fullBlockStr = `${block.header}\n${blockContent}`;
            finalOutput += fullBlockStr;
            
            if (idx < currentBlocks.length - 1) {
               finalOutput += '\n\n';
            }
          });
        }

        // Save output for this language
        setOutputs(prev => {
            const newOutputs = { ...prev, [currentLang]: finalOutput };
            // If this is the first language finished, set it as active tab
            if (lIndex === 0) setActiveOutputTab(currentLang);
            return newOutputs;
        });
      }

      if (!stopProcessingRef.current) {
        setStatus('done');
        setBatchProgress(100);
      }

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || "An unexpected error occurred.");
    }
  };

  const handleDownload = (lang: string) => {
    const content = outputs[lang];
    if (!content) return;
    
    // UTF-8 BOM \uFEFF for Windows compatibility
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `output_${mode}_${lang}_${dualSexMode ? 'dual' : 'single'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveApiKey = () => {
    if (apiKey) {
      localStorage.setItem('gemini_api_key', apiKey);
      setShowApiKeyModal(false);
    }
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
             <button 
                onClick={() => setShowApiKeyModal(true)}
                className="text-gray-400 hover:text-white transition-colors"
                title="API Key Settings"
             >
               <Key className="w-5 h-5" />
             </button>
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
                <span className="font-medium text-gray-200">Source File</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-md transition-colors border border-gray-700 flex items-center gap-2">
                  <Upload className="w-3 h-3" />
                  Upload File
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.res,.dat" />
                </label>
              </div>
            </div>
            <div className="flex-1 relative">
              <textarea 
                className="w-full h-full bg-gray-950 p-4 text-sm font-mono text-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-900/50 custom-scrollbar"
                value={inputContent}
                onChange={(e) => setInputContent(e.target.value)}
                spellCheck={false}
                placeholder="Paste your source file content here..."
              />
            </div>
            <div className="p-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 text-right">
              Lines: {inputContent.split('\n').length} | Size: {(inputContent.length / 1024).toFixed(1)} KB
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
                        disabled={!inputContent.trim()}
                        variant={mode === 'rewrite' ? 'secondary' : 'primary'}
                    >
                        {mode === 'rewrite' ? 'Start Rewrite' : 'Start Translation'}
                    </Button>
                )}

                {status === 'processing' && (
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Processing: {LANGUAGES.find(l => l.value === selectedLangs[currentLangIndex])?.label.split(' ')[0]}</span>
                        <span>{Math.round((currentLangIndex / selectedLangs.length) * 100)}% Total</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        {/* Overall progress approximation */}
                        <div 
                        className={`h-full rounded-full transition-all duration-300 ${mode === 'rewrite' ? 'bg-teal-500' : 'bg-indigo-500'}`}
                        style={{ width: `${((currentLangIndex + (batchProgress/100)) / selectedLangs.length) * 100}%` }}
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
                        <span className="font-medium text-gray-200">Result</span>
                    </div>
                    {Object.keys(outputs).length > 0 && activeOutputTab && (
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={() => handleDownload(activeOutputTab)} 
                            className="gap-2"
                        >
                            <Download className="w-4 h-4" /> Download Current
                        </Button>
                    )}
                </div>
                
                {/* Language Tabs */}
                {Object.keys(outputs).length > 0 && (
                    <div className="flex px-4 gap-2 overflow-x-auto custom-scrollbar pb-0">
                        {Object.keys(outputs).map(lang => (
                            <button
                                key={lang}
                                onClick={() => setActiveOutputTab(lang)}
                                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                                    activeOutputTab === lang 
                                    ? 'border-indigo-500 text-indigo-400 bg-gray-800/50 rounded-t-md' 
                                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30 rounded-t-md'
                                }`}
                            >
                                {LANGUAGES.find(l => l.value === lang)?.label.split(' ')[0] || lang}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 relative">
              <textarea 
                className="w-full h-full bg-gray-950 p-4 text-sm font-mono text-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-teal-900/50 custom-scrollbar"
                value={activeOutputTab ? outputs[activeOutputTab] : ''}
                readOnly
                placeholder={status === 'processing' ? "Processing..." : "Select languages and start processing to see results here..."}
              />
            </div>
            
            <div className="p-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 text-right">
              {activeOutputTab && outputs[activeOutputTab] 
                ? `Language: ${LANGUAGES.find(l => l.value === activeOutputTab)?.label} | Lines: ${outputs[activeOutputTab].split('\n').length}` 
                : 'Waiting for process...'}
            </div>
          </div>
        </div>
      </main>

       {/* API Key Modal */}
       {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-500" /> Enter API Key
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              To use the service, you need a valid Google Gemini API key. This key is stored locally in your browser.
            </p>
            <input 
              type="password"
              className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white mb-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="Enter your API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              {process.env.API_KEY && (
                 <Button variant="ghost" onClick={() => setShowApiKeyModal(false)}>Cancel</Button>
              )}
              <Button onClick={saveApiKey}>Save API Key</Button>
            </div>
            <p className="mt-4 text-xs text-gray-600 text-center">
              Don't have a key? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">Get one here</a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;