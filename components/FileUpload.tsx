
import React, { useRef, useState } from 'react';
import { Upload, FileCode, FileUp } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (content: string, fileName: string) => void;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      onFileSelect(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFile(e.target.files?.[0] as File);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
    processFile(e.dataTransfer.files?.[0] as File);
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
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          group relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300
          ${disabled 
            ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed' 
            : isDragging
            ? 'border-primary-500 bg-primary-50 shadow-lg'
            : 'border-slate-300 bg-slate-50 hover:bg-white hover:border-primary-500 hover:shadow-md'
          }
        `}
      >
        <div className="flex flex-col items-center gap-5 relative z-10">
          <div className={`p-4 rounded-full transition-all duration-300 group-hover:scale-110 ${disabled ? 'bg-slate-100 text-slate-400' : isDragging ? 'bg-white text-primary-600 scale-110' : 'bg-white text-primary-600 shadow-md group-hover:bg-primary-600 group-hover:text-white'}`}>
            <FileUp className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
              {isDragging ? 'Drop file here' : 'Select Resource File'}
            </h3>
            <p className="text-slate-500 text-[11px] font-medium tracking-wide">
              {isDragging ? ' ' : 'Supports .js, .ts, .json, .txt, .res'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
