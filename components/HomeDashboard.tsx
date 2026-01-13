
import React, { useState, useEffect } from 'react';
import { FileText, Code, Database, AlignLeft, ArrowRight, Sparkles, HardDrive, Clock } from 'lucide-react';
import { workspaceService } from '../services/workspaceService';
import { StoredFile } from '../types';

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

const timeAgo = (date: string | number | Date) => {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
};

const RecentFileCard = ({ file, onSelectModule }: { file: StoredFile; onSelectModule: (module: string) => void }) => {

  const getIcon = (module: string) => {
    switch(module) {
      case 'predictions': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'resources': return <Code className="w-4 h-4 text-green-500" />;
      case 'database': return <Database className="w-4 h-4 text-pink-500" />;
      case 'formatter': return <AlignLeft className="w-4 h-4 text-slate-500" />;
      default: return <HardDrive className="w-4 h-4" />;
    }
  };

  return (
    <button
      onClick={() => onSelectModule(file.module)}
      className="w-full text-left p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all flex items-center gap-4"
    >
      {getIcon(file.module)}
      <div className="flex-1">
        <p className="font-bold text-xs text-slate-800 truncate">{file.name}</p>
        <p className="text-[10px] text-slate-500 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {timeAgo(file.modifiedAt)}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-400" />
    </button>
  );
};


export const HomeDashboard: React.FC<Props> = ({ onSelectModule }) => {
  const [recentFiles, setRecentFiles] = useState<StoredFile[]>([]);

  useEffect(() => {
    workspaceService.listFiles()
      .then(files => {
        const sorted = files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
        setRecentFiles(sorted.slice(0, 3));
      })
      .catch(err => console.error("Failed to fetch recent files:", err));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8 md:p-16 flex flex-col items-center justify-center">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
           <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm mb-6">
              <Sparkles className="w-8 h-8 text-primary-600" />
           </div>
           <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">AI Localization Suite</h1>
           <p className="text-slate-500 max-w-xl mx-auto text-lg">Select a specialized module to begin your translation or formatting task. Each module operates independently.</p>
        </div>

        <div className="flex gap-8">
            <div className="flex-[2]">
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
            <div className="flex-1">
                <div className="bg-white/80 p-6 rounded-2xl border border-slate-200/80">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        Recent Activity
                    </h3>
                    <div className="space-y-3">
                        {recentFiles.length > 0 ? (
                            recentFiles.map(file => <RecentFileCard key={file.id} file={file} onSelectModule={onSelectModule} />)
                        ) : (
                            <p className="text-xs text-slate-500 text-center py-4">No recent files found.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
