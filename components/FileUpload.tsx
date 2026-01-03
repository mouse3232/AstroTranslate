
import React, { useRef } from 'react';
import { Upload, FileCode } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (content: string, fileName: string) => void;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      onFileSelect(content, file.name);
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".js,.json,.ts,.jsx,.tsx,.txt,.res,.dat"
        className="hidden"
        disabled={disabled}
      />
      <div 
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300
          ${disabled 
            ? 'border-gray-800 bg-gray-900/20 opacity-50 cursor-not-allowed' 
            : 'border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-400 hover:shadow-[0_0_30px_rgba(79,70,229,0.1)]'
          }
        `}
      >
        <div className="flex flex-col items-center gap-4">
          <div className={`p-5 rounded-full ${disabled ? 'bg-gray-800' : 'bg-indigo-500/20 text-indigo-400'}`}>
            <FileCode className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-200 uppercase tracking-tight">Select Resource File</h3>
            <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mt-2">Supports .js, .ts, .json, .txt, .res, .dat</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
