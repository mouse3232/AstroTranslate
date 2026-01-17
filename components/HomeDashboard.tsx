
import React from 'react';
import { FileText, Code, Database, AlignLeft, ArrowRight, Sparkles, HelpCircle, BookOpen, Type, HardDrive, Split, Wand2, Scroll, CheckCircle2, AlertCircle, Space, MoveVertical } from 'lucide-react';
import { Button } from './Button';

interface Props {
  onSelectModule: (module: string) => void;
}

export const HomeDashboard: React.FC<Props> = ({ onSelectModule }) => {
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Hero */}
      <div className="bg-slate-50 border-b border-slate-200 px-8 py-12">
         <div className="w-full">
             <div className="flex items-center gap-6 mb-6">
                 <div className="p-5 bg-white rounded-2xl shadow-sm">
                    <Sparkles className="w-10 h-10 text-primary-600" />
                 </div>
                 <div>
                    <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Documentation & User Guide</h1>
                    <p className="text-slate-500 text-xl mt-2">
                        Comprehensive workflows, feature definitions, and usage instructions for the AI Translation Suite.
                    </p>
                 </div>
             </div>
         </div>
      </div>

      <div className="w-full px-8 py-12 space-y-20">
        
        {/* Module 1: Text Translation */}
        <section className="grid grid-cols-12 gap-10 pb-16 border-b border-slate-100">
           <div className="col-span-12 lg:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><FileText className="w-8 h-8" /></div>
                  <h2 className="text-2xl font-bold text-slate-900">Text Translation</h2>
              </div>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                 The core engine for processing raw text files or astrology prediction blocks. It uses smart batching to handle large files efficiently.
              </p>
              <Button onClick={() => onSelectModule('predictions')} className="w-full justify-between h-12 text-base">
                 Go to Module <ArrowRight className="w-5 h-5"/>
              </Button>
           </div>
           
           <div className="col-span-12 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-primary-600"/> Step-by-Step Workflow
                  </h3>
                  <ol className="relative border-l border-slate-200 ml-2 space-y-8">
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">1. Import Content</h4>
                          <p className="text-sm text-slate-500 mt-1">Click <strong>+ Import</strong> to select text files, or paste raw text directly into the editor area.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">2. Select Target</h4>
                          <p className="text-sm text-slate-500 mt-1">Choose your desired output language from the dropdown (e.g., Hindi, Tamil).</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">3. Configure & Process</h4>
                          <p className="text-sm text-slate-500 mt-1">Toggle options like <strong>Dual Sex</strong> or <strong>Keep Sanskrit</strong> (see glossary), then click <strong>Start Process</strong>.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 ring-4 ring-green-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">4. Retrieve Output</h4>
                          <p className="text-sm text-slate-500 mt-1">
                              A progress bar will track completion. Once finished, the file is auto-saved to the <strong>Workspace</strong>. Open the workspace drawer to download the final result.
                          </p>
                      </li>
                  </ol>
               </div>

               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <HelpCircle className="w-5 h-5 text-primary-600"/> Glossary of Terms
                  </h3>
                  <div className="space-y-6">
                      <div className="flex gap-4 items-start">
                          <div className="mt-1"><Split className="w-5 h-5 text-slate-400"/></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Dual Sex Mode</span>
                              <p className="text-sm text-slate-500 leading-relaxed mt-1">
                                  When enabled, the AI generates two versions for every text block: one for Male context (Sex=0) and one for Female context (Sex=1). This ensures "Businessman" becomes "Vyapari" (M) or "Vyaparin" (F) correctly.
                              </p>
                          </div>
                      </div>
                      <div className="flex gap-4 items-start">
                          <div className="mt-1"><Wand2 className="w-5 h-5 text-slate-400"/></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Transliterate</span>
                              <p className="text-sm text-slate-500 leading-relaxed mt-1">
                                  Converts Sanskrit Mantras into phonetic English script instead of translating the meaning (e.g., "Om Namah Shivaya" stays as is, written in English letters).
                              </p>
                          </div>
                      </div>
                      <div className="flex gap-4 items-start">
                          <div className="mt-1"><Scroll className="w-5 h-5 text-slate-400"/></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Keep Sanskrit</span>
                              <p className="text-sm text-slate-500 leading-relaxed mt-1">
                                  Retains Mantras in their original Devanagari script entirely. The AI detects shlokas and preserves them untouched.
                              </p>
                          </div>
                      </div>
                  </div>
               </div>
           </div>
        </section>

        {/* Module 2: Resources */}
        <section className="grid grid-cols-12 gap-10 pb-16 border-b border-slate-100">
           <div className="col-span-12 lg:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-green-50 text-green-600 rounded-lg"><Code className="w-8 h-8" /></div>
                  <h2 className="text-2xl font-bold text-slate-900">Resource Translator</h2>
              </div>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                 Specialized for UI resources. It separates code syntax from translatable content.
              </p>
              <Button onClick={() => onSelectModule('resources')} className="w-full justify-between h-12 text-base">
                 Go to Module <ArrowRight className="w-5 h-5"/>
              </Button>
           </div>
           
           <div className="col-span-12 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                    <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-green-600"/> Step-by-Step Workflow
                    </h3>
                    <ol className="relative border-l border-slate-200 ml-2 space-y-8">
                        <li className="ml-8">
                            <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                            <h4 className="text-sm font-bold text-slate-700 uppercase">1. Upload File</h4>
                            <p className="text-sm text-slate-500 mt-1">Support for <code>.js</code>, <code>.json</code>, <code>.res</code> (DotNet), or <code>.txt</code> (Key=Value).</p>
                        </li>
                        <li className="ml-8">
                            <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                            <h4 className="text-sm font-bold text-slate-700 uppercase">2. Select Target</h4>
                            <p className="text-sm text-slate-500 mt-1">Choose the output language from the dropdown menu.</p>
                        </li>
                        <li className="ml-8">
                            <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 ring-4 ring-green-50 mt-1.5"></span>
                            <h4 className="text-sm font-bold text-slate-700 uppercase">3. Process</h4>
                            <p className="text-sm text-slate-500 mt-1">The system parses code/keys and only translates value strings.</p>
                        </li>
                    </ol>
                </div>
                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                    <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-green-600"/> Intelligent Parsing
                    </h3>
                    <div className="space-y-6">
                        <div className="flex gap-4 items-start">
                             <div className="mt-1"><Code className="w-5 h-5 text-slate-400"/></div>
                             <div>
                                <span className="text-sm font-bold text-slate-700">Code Files (.js/.ts)</span>
                                <p className="text-sm text-slate-500 leading-relaxed mt-1">
                                    Variables and keywords (e.g., <code>const</code>, <code>function</code>) are strictly ignored. Only string literals (e.g., <code>"Hello"</code>) are translated.
                                </p>
                             </div>
                        </div>
                        <div className="flex gap-4 items-start">
                             <div className="mt-1"><FileText className="w-5 h-5 text-slate-400"/></div>
                             <div>
                                <span className="text-sm font-bold text-slate-700">Resource Files (.res/.txt)</span>
                                <p className="text-sm text-slate-500 leading-relaxed mt-1">
                                    Keys are preserved. <code>WelcomeMessage=Hello</code> becomes <code>WelcomeMessage=नमस्ते</code>.
                                </p>
                             </div>
                        </div>
                    </div>
                </div>
           </div>
        </section>

        {/* Module 3: Database */}
        <section className="grid grid-cols-12 gap-10 pb-16 border-b border-slate-100">
           <div className="col-span-12 lg:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-pink-50 text-pink-600 rounded-lg"><Database className="w-8 h-8" /></div>
                  <h2 className="text-2xl font-bold text-slate-900">Database Translator</h2>
              </div>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                 Process SQLite (.db) files directly. Maintains relational integrity using Row IDs.
              </p>
              <Button onClick={() => onSelectModule('database')} className="w-full justify-between h-12 text-base">
                 Go to Module <ArrowRight className="w-5 h-5"/>
              </Button>
           </div>
           
           <div className="col-span-12 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                   <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                       <BookOpen className="w-5 h-5 text-pink-600"/> Step-by-Step Workflow
                   </h3>
                   <ol className="relative border-l border-slate-200 ml-2 space-y-8">
                       <li className="ml-8">
                           <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                           <h4 className="text-sm font-bold text-slate-700 uppercase">1. Load Source</h4>
                           <p className="text-sm text-slate-500 mt-1">Select your input <code>.db</code> file.</p>
                       </li>
                       <li className="ml-8">
                           <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                           <h4 className="text-sm font-bold text-slate-700 uppercase">2. Select Tables</h4>
                           <p className="text-sm text-slate-500 mt-1">Use the dropdown to pick specific tables (e.g., Predictions, Planets).</p>
                       </li>
                       <li className="ml-8">
                           <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                           <h4 className="text-sm font-bold text-slate-700 uppercase">3. Target DB (Optional)</h4>
                           <p className="text-sm text-slate-500 mt-1">If you want to merge translations into an existing DB, load it as a Target. Otherwise, a new clone is created.</p>
                       </li>
                       <li className="ml-8">
                           <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 ring-4 ring-green-50 mt-1.5"></span>
                           <h4 className="text-sm font-bold text-slate-700 uppercase">4. Start Process</h4>
                           <p className="text-sm text-slate-500 mt-1">The system reads text columns, translates them row-by-row, and commits changes transactionally.</p>
                       </li>
                   </ol>
                </div>
                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                   <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                       <HelpCircle className="w-5 h-5 text-pink-600"/> Dual Sex in Database
                   </h3>
                   <p className="text-sm text-slate-500 leading-relaxed mb-6">
                       When <strong>Dual Sex</strong> is enabled for a database translation:
                   </p>
                   <ul className="text-sm text-slate-500 space-y-4 list-disc pl-4 leading-relaxed">
                       <li>The system adds a <code>Sex</code> column to the table (if missing).</li>
                       <li>It <strong>duplicates</strong> every source row.</li>
                       <li>One row is set to <code>Sex=0</code> (Male) and translated with masculine context.</li>
                       <li>One row is set to <code>Sex=1</code> (Female) and translated with feminine context.</li>
                   </ul>
                </div>
           </div>
        </section>

        {/* Module 4: Tab Formatter */}
        <section className="grid grid-cols-12 gap-10 pb-16 border-b border-slate-100">
           <div className="col-span-12 lg:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><AlignLeft className="w-8 h-8" /></div>
                  <h2 className="text-2xl font-bold text-slate-900">Tab Formatter</h2>
              </div>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                 A specialized utility to clean up database formatting, specifically managing indentation for better readability in the final output.
              </p>
              <Button onClick={() => onSelectModule('formatter')} className="w-full justify-between h-12 text-base">
                 Go to Module <ArrowRight className="w-5 h-5"/>
              </Button>
           </div>
           
           <div className="col-span-12 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-indigo-600"/> Step-by-Step Workflow
                  </h3>
                  <ol className="relative border-l border-slate-200 ml-2 space-y-8">
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">1. Load Database</h4>
                          <p className="text-sm text-slate-500 mt-1">Import your SQLite (.db) file containing the tables you want to format.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">2. Select Tables</h4>
                          <p className="text-sm text-slate-500 mt-1">Choose which tables to scan. The tool automatically detects text columns.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-indigo-500 ring-4 ring-indigo-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">3. Scan & Fix</h4>
                          <p className="text-sm text-slate-500 mt-1">Click <strong>Scan Issues</strong> to see a report, then <strong>Apply Fixes</strong> to merge changes.</p>
                      </li>
                  </ol>
               </div>

               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-indigo-600"/> Formatting Rules
                  </h3>
                  <div className="space-y-6">
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-indigo-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">1. Clean</span>
                              <p className="text-sm text-slate-500 mt-1">Removes literal <code>\t</code> and <code>/t</code> text.</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-indigo-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">2. Check: Length</span>
                              <p className="text-sm text-slate-500 mt-1">Does it have 5+ words? &rarr; <strong>Add Tab (\t)</strong>.</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-indigo-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">3. Preservation</span>
                              <p className="text-sm text-slate-500 mt-1">Skips lines already starting with tabs or ending with a colon <code>:</code>.</p>
                          </div>
                      </div>
                  </div>
               </div>
           </div>
        </section>

        {/* Module 5: Space Cleaner */}
        <section className="grid grid-cols-12 gap-10 pb-16 border-b border-slate-100">
           <div className="col-span-12 lg:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Space className="w-8 h-8" /></div>
                  <h2 className="text-2xl font-bold text-slate-900">Space Cleaner</h2>
              </div>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                 Detects and repairs extra whitespace issues in text columns (more than 2 consecutive spaces).
              </p>
              <Button onClick={() => onSelectModule('whitespace')} className="w-full justify-between h-12 text-base">
                 Go to Module <ArrowRight className="w-5 h-5"/>
              </Button>
           </div>
           
           <div className="col-span-12 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-purple-600"/> Step-by-Step Workflow
                  </h3>
                  <ol className="relative border-l border-slate-200 ml-2 space-y-8">
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">1. Load Database</h4>
                          <p className="text-sm text-slate-500 mt-1">Import your SQLite (.db) file.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">2. Scan Spaces</h4>
                          <p className="text-sm text-slate-500 mt-1">Click <strong>Scan Spaces</strong> to find rows with &gt; 2 spaces.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-purple-500 ring-4 ring-purple-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">3. Trim Spaces</h4>
                          <p className="text-sm text-slate-500 mt-1">Review the report and click <strong>Trim Spaces</strong> to normalize whitespace.</p>
                      </li>
                  </ol>
               </div>

               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-purple-600"/> Fix Logic
                  </h3>
                  <div className="space-y-6">
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-purple-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Detection</span>
                              <p className="text-sm text-slate-500 mt-1">Identifies any text sequence containing 3 or more spaces (e.g. "Hello   World").</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-purple-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Correction</span>
                              <p className="text-sm text-slate-500 mt-1">Replaces the sequence with a single space character.</p>
                          </div>
                      </div>
                  </div>
               </div>
           </div>
        </section>

        {/* Module 6: Line Spacing Fixer */}
        <section className="grid grid-cols-12 gap-10 pb-16 border-b border-slate-100">
           <div className="col-span-12 lg:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-lg"><MoveVertical className="w-8 h-8" /></div>
                  <h2 className="text-2xl font-bold text-slate-900">Line Spacing Fixer</h2>
              </div>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                 Normalizes newlines, removes trailing whitespace, and ensures proper paragraph spacing in database text.
              </p>
              <Button onClick={() => onSelectModule('linespacing')} className="w-full justify-between h-12 text-base">
                 Go to Module <ArrowRight className="w-5 h-5"/>
              </Button>
           </div>
           
           <div className="col-span-12 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-orange-600"/> Step-by-Step Workflow
                  </h3>
                  <ol className="relative border-l border-slate-200 ml-2 space-y-8">
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">1. Load Database</h4>
                          <p className="text-sm text-slate-500 mt-1">Import your SQLite (.db) file.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">2. Check Spacing</h4>
                          <p className="text-sm text-slate-500 mt-1">Scan for rows with excessive newlines or trailing whitespace.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-orange-500 ring-4 ring-orange-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">3. Fix Spacing</h4>
                          <p className="text-sm text-slate-500 mt-1">Apply fixes to normalize line endings and reduce gaps.</p>
                      </li>
                  </ol>
               </div>

               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-orange-600"/> Fix Logic
                  </h3>
                  <div className="space-y-6">
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-orange-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Newlines</span>
                              <p className="text-sm text-slate-500 mt-1">Converts 3+ consecutive newlines to exactly 2 (standard paragraph break).</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-orange-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Trailing Space</span>
                              <p className="text-sm text-slate-500 mt-1">Removes any spaces or tabs at the end of every line.</p>
                          </div>
                      </div>
                  </div>
               </div>
           </div>
        </section>

        {/* Module 7: Char Check */}
        <section className="grid grid-cols-12 gap-10 pb-16 border-b border-slate-100">
           <div className="col-span-12 lg:col-span-3">
              <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-red-50 text-red-600 rounded-lg"><Type className="w-8 h-8" /></div>
                  <h2 className="text-2xl font-bold text-slate-900">Char Check</h2>
              </div>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                 Anomaly detector for language validation. Checks databases for character set violations.
              </p>
              <Button onClick={() => onSelectModule('charcheck')} className="w-full justify-between h-12 text-base">
                 Go to Module <ArrowRight className="w-5 h-5"/>
              </Button>
           </div>
           
           <div className="col-span-12 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-red-600"/> Step-by-Step Workflow
                  </h3>
                  <ol className="relative border-l border-slate-200 ml-2 space-y-8">
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">1. Load Database</h4>
                          <p className="text-sm text-slate-500 mt-1">Import your SQLite (.db) file.</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-300 ring-4 ring-slate-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">2. Select Mode</h4>
                          <p className="text-sm text-slate-500 mt-1">Choose <strong>Find Hindi</strong> (if scanning an English DB) or <strong>Find English</strong> (if scanning a Hindi DB).</p>
                      </li>
                      <li className="ml-8">
                          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 ring-4 ring-red-50 mt-1.5"></span>
                          <h4 className="text-sm font-bold text-slate-700 uppercase">3. Review Report</h4>
                          <p className="text-sm text-slate-500 mt-1">Review the list of anomalies and download the report if needed.</p>
                      </li>
                  </ol>
               </div>

               <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                  <h3 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600"/> Detection Logic
                  </h3>
                  <div className="space-y-6">
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-red-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Find Hindi</span>
                              <p className="text-sm text-slate-500 mt-1">Scans for any Hindi characters (Unicode <code>\u0900-\u097F</code>). Useful for finding leaked translations in an English DB.</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <div className="mt-2 h-2 w-2 rounded-full bg-red-500 shrink-0"></div>
                          <div>
                              <span className="text-sm font-bold text-slate-700">Find English</span>
                              <p className="text-sm text-slate-500 mt-1">Scans for any English characters (A-Z). Useful for finding untranslated text in a Hindi DB.</p>
                          </div>
                      </div>
                  </div>
               </div>
           </div>
        </section>

        {/* Workspace Guide */}
        <section className="bg-slate-900 rounded-2xl p-10 text-white">
            <div className="flex items-start gap-8">
                <div className="p-4 bg-slate-800 rounded-xl shrink-0">
                    <HardDrive className="w-10 h-10 text-primary-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold mb-6">Workspace & File Management</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div>
                            <h3 className="text-base font-bold text-slate-300 uppercase tracking-wider mb-3">Storage Location</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">
                                <strong>Desktop App:</strong> Files are stored locally in your Documents folder:<br/>
                                <code className="bg-slate-800 px-3 py-1.5 rounded text-primary-300 text-xs mt-2 block w-fit font-mono">Documents/Translate-App-Workspace</code>
                            </p>
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-300 uppercase tracking-wider mb-3">File Format & Access</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">
                                Files are stored internally as <strong>JSON</strong> to preserve metadata (module type, creation date). 
                            </p>
                            <p className="text-sm text-slate-400 leading-relaxed mt-4">
                                <strong className="text-white">How to export:</strong> Open the "Workspace" drawer (top right), find your file, and click the <span className="inline-flex items-center gap-1 bg-slate-700 px-2 py-0.5 rounded text-[11px] uppercase font-bold">Download</span> button. This converts the JSON back to the original format (.txt, .db, .js) and prompts a "Save As" dialog.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

      </div>
    </div>
  );
};
