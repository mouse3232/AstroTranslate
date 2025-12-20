import React, { useState, useEffect } from 'react';
import { Upload, Download, Languages, FileText, Split, ArrowRightLeft, Key, Sparkles, Wand2 } from 'lucide-react';
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

#* Planet=0,Case=1
##*Text
Mars is aspecting the 7th house, causing <Effect>.

#* Planet=0,House=0,GoodBad=0
##*Text
v©"kf/k ef.k  ea=k.kka]  xzg&u{k=  rkfjdk A
ÒkX;dkys ÒosfRlf)% vÒkX;a fu"Qya Òosr AA`;

function App() {
  const [inputContent, setInputContent] = useState(DEFAULT_CONTENT);
  const [outputContent, setOutputContent] = useState('');
  const [targetLang, setTargetLang] = useState<string>(TargetLanguage.Hindi);
  const [mode, setMode] = useState<ProcessingMode>('translate');
  const [dualSexMode, setDualSexMode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [apiKey, setApiKey] = useState(process.env.API_KEY || '');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

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

  const handleProcess = async () => {
    if (!apiKey) {
      setShowApiKeyModal(true);
      return;
    }
    
    setStatus('processing');
    setProgress(0);
    setErrorMsg('');
    setOutputContent('');

    try {
      const gemini = new GeminiService(apiKey);
      const { preamble, blocks } = parseInputFile(inputContent);
      
      // Step 1: Expand blocks based on Dual Sex Mode
      interface TargetBlock {
        header: string;
        lines: string[]; 
        gender: 'Male' | 'Female' | 'Neutral';
      }

      const targetBlocks: TargetBlock[] = [];

      blocks.forEach(block => {
        if (dualSexMode) {
          // Block 1: Male (Sex=0)
          targetBlocks.push({
            header: updateHeaderSex(block.header, 0),
            lines: [...block.contentLines],
            gender: 'Male'
          });
          
          // Block 2: Female (Sex=1)
          targetBlocks.push({
            header: updateHeaderSex(block.header, 1),
            lines: [...block.contentLines],
            gender: 'Female'
          });
        } else {
          // Single mode
          const gender = getGenderFromHeader(block.header);
          targetBlocks.push({
            header: block.header,
            lines: [...block.contentLines],
            gender
          });
        }
      });

      // Step 2: Identify all items that need processing
      const processingItems: ProcessingItem[] = [];
      
      targetBlocks.forEach((block, blockIdx) => {
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

      // Step 3: Batch Process
      const totalItems = processingItems.length;
      const BATCH_SIZE = 15;
      
      if (totalItems > 0) {
        for (let i = 0; i < totalItems; i += BATCH_SIZE) {
          const batch = processingItems.slice(i, i + BATCH_SIZE);
          
          const apiRequests = batch.map(item => ({
            text: item.text,
            context: item.context
          }));

          const results = await gemini.translateBatch(apiRequests, targetLang, mode);
          
          batch.forEach((item, idx) => {
            const blockIdx = parseInt(item.blockId.substring(1));
            if (results[idx] !== undefined) {
               targetBlocks[blockIdx].lines[item.lineIndex] = results[idx];
            }
          });

          setProgress(Math.round(((i + BATCH_SIZE) / totalItems) * 100));
        }
      } else {
        setProgress(100);
      }

      // Step 4: Reconstruct File
      // We start with the preamble (filename etc).
      // We ensure there is exactly ONE blank line (newline char) separating preamble from blocks if needed.
      let finalOutput = preamble.trimEnd();

      if (targetBlocks.length > 0) {
        // Add space after preamble before first block
        if (finalOutput.length > 0) {
            finalOutput += '\n\n';
        }

        targetBlocks.forEach((block, idx) => {
          // Join the content lines. 
          // We trimEnd() the entire content block to remove trailing newlines that came from source file splitting
          // This allows us to control the inter-block spacing manually below.
          const blockContent = block.lines.join('\n').trimEnd();
          
          const fullBlockStr = `${block.header}\n${blockContent}`;
          
          finalOutput += fullBlockStr;
          
          // Add exactly one blank line between blocks (Standard for .res files)
          // i.e., \n\n. This produces:
          // Block 1
          // (blank line)
          // Block 2
          if (idx < targetBlocks.length - 1) {
             finalOutput += '\n\n';
          }
        });
      }

      setOutputContent(finalOutput);
      setStatus('done');
      setProgress(100);

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || "An unexpected error occurred.");
    }
  };

  const handleDownload = () => {
    // UTF-8 BOM \uFEFF is not strictly required but helpful for some Windows apps to detect UTF-8
    const blob = new Blob(['\uFEFF' + outputContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `output_${mode}_${targetLang}_${dualSexMode ? 'dual' : 'single'}.txt`;
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
             <a href="#" className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">Docs</a>
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
        <div className="lg:w-72 flex flex-col gap-6 justify-center">
          
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
              <p className="text-[10px] text-gray-500">
                {mode === 'translate' 
                  ? 'Translates text to target language.' 
                  : 'Corrects grammar in target language without translating.'}
              </p>
            </div>

            {/* Target Language */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Languages className="w-4 h-4" /> Target Language
              </label>
              <select 
                className="w-full bg-gray-950 border border-gray-700 text-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
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

            {/* Action Button */}
            <Button 
              className="w-full py-3" 
              onClick={handleProcess}
              isLoading={status === 'processing'}
              disabled={!inputContent.trim()}
              variant={mode === 'rewrite' ? 'secondary' : 'primary'}
            >
               {status === 'processing' ? 'Processing...' : (mode === 'rewrite' ? 'Start Rewrite' : 'Start Translation')}
            </Button>

            {status === 'processing' && (
              <div className="w-full bg-gray-800 rounded-full h-2 mt-2 overflow-hidden">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${mode === 'rewrite' ? 'bg-teal-500' : 'bg-indigo-500'}`}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            )}

            {status === 'error' && (
              <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-xs text-red-400">
                {errorMsg}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="flex-1 flex flex-col gap-4 min-h-[500px]">
          <div className="bg-gray-900 rounded-xl border border-gray-800 flex flex-col h-full shadow-xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
                <span className="font-medium text-gray-200">Result</span>
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleDownload} 
                disabled={!outputContent}
                className="gap-2"
              >
                <Download className="w-4 h-4" /> Download
              </Button>
            </div>
            <div className="flex-1 relative">
              <textarea 
                className="w-full h-full bg-gray-950 p-4 text-sm font-mono text-gray-300 resize-none focus:outline-none focus:ring-1 focus:ring-teal-900/50 custom-scrollbar"
                value={outputContent}
                readOnly
                placeholder="Output will appear here..."
              />
            </div>
            <div className="p-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 text-right">
              {outputContent ? `Lines: ${outputContent.split('\n').length} | Size: ${(outputContent.length / 1024).toFixed(1)} KB` : 'Waiting for process...'}
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