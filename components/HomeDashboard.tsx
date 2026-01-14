
import React from 'react';
import { FileText, Code, Database, AlignLeft, ArrowRight, Sparkles, HelpCircle, BookOpen, Type } from 'lucide-react';
import { Button } from './Button';

interface Props {
  onSelectModule: (module: string) => void;
}

export const HomeDashboard: React.FC<Props> = ({ onSelectModule }) => {
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Hero / Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-8 py-12 text-center">
         <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm mb-6">
            <Sparkles className="w-8 h-8 text-primary-600" />
         </div>
         <h1 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">AI Localization Suite</h1>
         <p className="text-slate-500 max-w-2xl mx-auto text-lg leading-relaxed">
            Welcome to the centralized help center and glossary. Below you will find detailed documentation on how each module operates and how to utilize them effectively for your astrology software localization.
         </p>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-12 space-y-12">
        
        {/* Module 1: Resources */}
        <section className="flex gap-8 items-start pb-12 border-b border-slate-100">
           <div className="shrink-0 p-4 bg-green-50 text-green-600 rounded-xl">
              <Code className="w-8 h-8" />
           </div>
           <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-bold text-slate-900">1. Resource Localizer</h2>
                 <Button onClick={() => onSelectModule('resources')}>Open Module <ArrowRight className="w-4 h-4 ml-2"/></Button>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Designed for UI strings and code resources. It intelligently distinguishes between code syntax (which must not change) and translatable string values.
              </p>
               <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Supported Formats</h3>
                  <div className="flex gap-2 flex-wrap">
                      {['.js', '.json', '.ts', '.res (DotNet)', '.txt (Key=Value)'].map(ext => (
                          <span key={ext} className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono text-slate-600">{ext}</span>
                      ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                     For Key-Value files (e.g., <code>Key=Value</code>), it strictly translates only the value part. For Code files, it identifies string literals and translates them while ignoring variable names and keywords.
                  </p>
               </div>
           </div>
        </section>

        {/* Module 2: Predictions (Text Translation) */}
        <section className="flex gap-8 items-start pb-12 border-b border-slate-100">
           <div className="shrink-0 p-4 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-8 h-8" />
           </div>
           <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-bold text-slate-900">2. Text Translation</h2>
                 <Button onClick={() => onSelectModule('predictions')}>Open Module <ArrowRight className="w-4 h-4 ml-2"/></Button>
              </div>
              <p className="text-slate-600 leading-relaxed">
                The core engine for translating astrology prediction text blocks. It parses custom format files (blocks separated by <code>#*</code> headers) and preserves rigid formatting rules.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                 <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><BookOpen className="w-3 h-3"/> How it works</h3>
                    <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
                       <li>Parses input file into blocks based on <code>#*</code> delimiter.</li>
                       <li>Extracts gender context (Sex=0 for Male, Sex=1 for Female) from headers.</li>
                       <li>Sends content to Gemini AI using <strong>Smart Batching</strong> to optimize context window usage.</li>
                       <li>Reconstructs the file with translated text, preserving headers and structure.</li>
                    </ul>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><Sparkles className="w-3 h-3"/> Key Features</h3>
                    <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
                       <li><strong>Context-Aware:</strong> Translates "Businessperson" to "Businessman" or "Businesswoman" based on header.</li>
                       <li><strong>Dual Sex Mode:</strong> Automatically generates both Male and Female versions for every block.</li>
                       <li><strong>Shloka Handling:</strong> Option to transliterate Sanskrit Mantras or keep them in Devanagari.</li>
                    </ul>
                 </div>
              </div>
           </div>
        </section>

        {/* Module 3: Database */}
        <section className="flex gap-8 items-start pb-12 border-b border-slate-100">
           <div className="shrink-0 p-4 bg-pink-50 text-pink-600 rounded-xl">
              <Database className="w-8 h-8" />
           </div>
           <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-bold text-slate-900">3. Database Translator</h2>
                 <Button onClick={() => onSelectModule('database')}>Open Module <ArrowRight className="w-4 h-4 ml-2"/></Button>
              </div>
              <p className="text-slate-600 leading-relaxed">
                 A powerful tool for processing SQLite (<code>.db</code>) files. It allows you to select specific tables and translates content columns while maintaining row integrity.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                 <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-2">Workflow</h3>
                    <ol className="text-xs text-slate-500 space-y-2 list-decimal pl-4">
                       <li>Load a Source <code>.db</code> file.</li>
                       <li>Select specific tables to translate.</li>
                       <li>(Optional) Load a Target <code>.db</code> to overwrite existing data.</li>
                       <li>The system identifies text columns (e.g., 'Text', 'Prediction') and translates them row-by-row.</li>
                    </ol>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-2">Safety Features</h3>
                    <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
                       <li><strong>Transactional Updates:</strong> Changes are committed only if the entire batch succeeds.</li>
                       <li><strong>ID Preservation:</strong> Row IDs are strictly preserved to ensure relational integrity.</li>
                       <li><strong>Format Preservation:</strong> Maintains tabs, newlines, and bullet points within database cells.</li>
                       <li><strong>Mantra Options:</strong> Supports Transliteration and Sanskrit preservation.</li>
                    </ul>
                 </div>
              </div>
           </div>
        </section>

        {/* Module 4: Formatter (Tab Formatting) */}
        <section className="flex gap-8 items-start pb-12 border-b border-slate-100">
           <div className="shrink-0 p-4 bg-slate-100 text-slate-600 rounded-xl">
              <AlignLeft className="w-8 h-8" />
           </div>
           <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-bold text-slate-900">4. Tab Formatting</h2>
                 <Button onClick={() => onSelectModule('formatter')}>Open Module <ArrowRight className="w-4 h-4 ml-2"/></Button>
              </div>
              <p className="text-slate-600 leading-relaxed">
                 A Quality Assurance (QA) tool to enforce styling rules before shipping.
              </p>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-2">Tab Fixer</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                    Automatically enforces indentation rules: Adds a tab character at the start of paragraphs containing 5+ words, unless they end with a colon.
                </p>
              </div>
           </div>
        </section>

        {/* Module 5: Char Check */}
        <section className="flex gap-8 items-start">
           <div className="shrink-0 p-4 bg-indigo-50 text-indigo-600 rounded-xl">
              <Type className="w-8 h-8" />
           </div>
           <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                 <h2 className="text-xl font-bold text-slate-900">5. Char Check</h2>
                 <Button onClick={() => onSelectModule('charcheck')}>Open Module <ArrowRight className="w-4 h-4 ml-2"/></Button>
              </div>
              <p className="text-slate-600 leading-relaxed">
                 Anomalies detector for language validation. Checks for mixed language content (e.g., Hindi chars in English DB).
              </p>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-2">Deep Scanning Logic</h3>
                <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
                    <li><strong>Target Columns:</strong> Strictly checks: <code>Text</code>, <code>Text1</code>, <code>Text2...</code>, <code>Question</code>, <code>Category</code>, <code>Prediction</code>, <code>Header</code>.</li>
                    <li><strong>Table Rules:</strong> For tables ending in <code>_Header</code>, the scan <strong>skips the first 3 rows</strong> to avoid false positives in metadata.</li>
                    <li><strong>Syntax Ignoring:</strong> Ignores special tags like <code>&lt;Var&gt;</code> to prevent errors.</li>
                    <li><strong>Regex:</strong> English Scan checks for <code>[A-Z]</code>. Hindi Scan checks for <code>[\u0900-\u097F]</code>.</li>
                </ul>
              </div>
           </div>
        </section>

      </div>
    </div>
  );
};
