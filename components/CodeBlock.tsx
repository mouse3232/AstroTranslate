
import React from 'react';
import { Copy } from 'lucide-react';

interface CodeBlockProps {
  title: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ title, code }) => {
  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-sm group hover:border-slate-300 transition-colors duration-300">
      <div className="bg-white px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</span>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
             <div className="text-[10px] text-slate-400 font-mono">READ ONLY</div>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden bg-slate-50">
        <textarea
          readOnly
          value={code}
          className="w-full h-full p-4 bg-transparent text-slate-700 font-mono text-[12px] resize-none focus:outline-none custom-scrollbar leading-relaxed whitespace-pre"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default CodeBlock;
