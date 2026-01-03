
import React from 'react';

interface CodeBlockProps {
  title: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ title, code }) => {
  return (
    <div className="flex flex-col h-full bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden shadow-xl transition-all hover:border-gray-700">
      <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex justify-between items-center">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</span>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800"></div>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <textarea
          readOnly
          value={code}
          className="w-full h-full p-6 bg-transparent text-indigo-100 font-mono text-[13px] resize-none focus:outline-none custom-scrollbar leading-relaxed whitespace-pre"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default CodeBlock;
