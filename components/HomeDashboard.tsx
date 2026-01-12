
import React from 'react';
import { FileText, Code, Database, AlignLeft, ArrowRight, Sparkles } from 'lucide-react';

interface Props {
  onSelectModule: (module: string) => void;
}

const ModuleCard = ({ icon, title, desc, onClick, color }: any) => (
  <button 
    onClick={onClick}
    className="group relative flex flex-col items-start p-6 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-xl hover:border-primary-200 transition-all duration-300 text-left w-full h-full overflow-hidden"
  >
    <div className={`absolute top-0 right-0 w-32 h-32 bg-${color}-50 rounded-full blur-3xl opacity-0 group-hover:opacity-50 transition-opacity -mr-10 -mt-10`}></div>
    
    <div className={`p-3 rounded-xl bg-${color}-50 text-${color}-600 mb-4 group-hover:scale-110 transition-transform duration-300`}>
      {icon}
    </div>
    
    <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-primary-700">{title}</h3>
    <p className="text-sm text-slate-500 leading-relaxed mb-6">{desc}</p>
    
    <div className="mt-auto flex items-center text-xs font-bold text-primary-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
      Launch Module <ArrowRight className="w-3 h-3 ml-1" />
    </div>
  </button>
);

export const HomeDashboard: React.FC<Props> = ({ onSelectModule }) => {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8 md:p-16 flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
           <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm mb-6">
              <Sparkles className="w-8 h-8 text-primary-600" />
           </div>
           <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">AI Localization Suite</h1>
           <p className="text-slate-500 max-w-xl mx-auto text-lg">Select a specialized module to begin your translation or formatting task. Each module operates independently.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <ModuleCard 
              color="blue"
              icon={<FileText className="w-6 h-6" />}
              title="Predictions Translator"
              desc="Specialized for astrology prediction text. Features context-aware gender handling, transliteration, and smart batching."
              onClick={() => onSelectModule('predictions')}
           />
           <ModuleCard 
              color="green"
              icon={<Code className="w-6 h-6" />}
              title="Resource Localizer"
              desc="Handle code resources (.js, .json, .res). Preserves syntax, keys, and variable placeholders while translating values."
              onClick={() => onSelectModule('resources')}
           />
           <ModuleCard 
              color="pink"
              icon={<Database className="w-6 h-6" />}
              title="Database Translator"
              desc="Process massive JSON datasets. Automatically detects structure and translates content columns while preserving IDs."
              onClick={() => onSelectModule('database')}
           />
           <ModuleCard 
              color="slate"
              icon={<AlignLeft className="w-6 h-6" />}
              title="Advanced Formatter"
              desc="Validation and formatting utilities. Enforce tab rules, detect language contamination (Hindi in English files), and clean text."
              onClick={() => onSelectModule('formatter')}
           />
        </div>
      </div>
    </div>
  );
};
