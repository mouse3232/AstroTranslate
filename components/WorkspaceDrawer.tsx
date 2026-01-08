
import React, { useEffect, useState } from 'react';
import { HardDrive, X, FileText, Database, Code, Trash2, Download, ArrowRight, RefreshCw, AlertCircle, Settings } from 'lucide-react';
import { StoredFile } from '../types';
import { workspaceService } from '../services/workspaceService';
import { Button } from './Button';

interface WorkspaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadFile: (file: StoredFile) => void;
  activeModule: string;
}

export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({ isOpen, onClose, onLoadFile, activeModule }) => {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [filter, setFilter] = useState<'all' | 'current'>('current');
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [customUrl, setCustomUrl] = useState(workspaceService.getApiUrl());
  const [isLoading, setIsLoading] = useState(false);

  // Helper to safely get the current effective URL for display
  const getCurrentEffectiveUrl = () => {
    const url = workspaceService.getApiUrl();
    return url === '' ? 'Same Origin (Relative)' : url;
  };

  const loadFiles = () => {
    setIsLoading(true);
    workspaceService.getFiles()
      .then(f => {
        setFiles(f);
        setError(null);
      })
      .catch(err => {
        setFiles([]);
        setError(err.message === 'Failed to fetch' ? 'Server unreachable' : err.message);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      loadFiles();
      setCustomUrl(workspaceService.getApiUrl());
      const unsubscribe = workspaceService.subscribe(loadFiles);
      return unsubscribe;
    }
  }, [isOpen]);

  const handleSaveConfig = () => {
    workspaceService.setApiUrl(customUrl);
    // Update local state to match the cleaned URL from service
    setCustomUrl(workspaceService.getApiUrl());
    setShowConfig(false);
    loadFiles();
  };

  const filteredFiles = files.filter(f => {
    if (filter === 'current') return f.module === activeModule;
    return true;
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Permanently delete this file from workspace?')) {
      try {
        await workspaceService.deleteFile(id);
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const handleDownload = (e: React.MouseEvent, file: StoredFile) => {
    e.stopPropagation();
    const blob = new Blob([file.content], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getIcon = (module: string) => {
    switch (module) {
      case 'predictions': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'resources': return <Code className="w-4 h-4 text-green-500" />;
      case 'database': return <Database className="w-4 h-4 text-pink-500" />;
      default: return <FileText className="w-4 h-4 text-slate-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${error ? 'bg-red-50 text-red-500' : 'bg-primary-50 text-primary-600'}`}>
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Workspace</h2>
              <div className="flex items-center gap-2">
                 <span className="text-[10px] text-slate-500 font-medium">Persistent Storage</span>
                 {error && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">OFFLINE</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
             <button onClick={() => setShowConfig(!showConfig)} className={`p-2 hover:bg-slate-100 rounded-lg transition-colors ${showConfig ? 'text-primary-600 bg-primary-50' : 'text-slate-400 hover:text-slate-600'}`} title="Connection Settings">
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Configuration Panel (To resolve client-side errors) */}
        {showConfig && (
           <div className="bg-slate-50 p-4 border-b border-slate-200 animate-in slide-in-from-top duration-200">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Workspace Server URL</label>
              <div className="flex gap-2">
                 <input 
                   type="text" 
                   value={customUrl} 
                   onChange={(e) => setCustomUrl(e.target.value)}
                   className="flex-1 text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:border-primary-500 focus:outline-none placeholder-slate-400"
                   placeholder="e.g. localhost:3000"
                 />
                 <Button size="sm" onClick={handleSaveConfig}>Save</Button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                 <strong>Active Connection:</strong> <span className="font-mono text-slate-600 bg-slate-100 px-1 rounded">{getCurrentEffectiveUrl()}</span><br/>
                 Leave empty to attempt auto-detection (127.0.0.1:3000).
              </p>
           </div>
        )}

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
          <div className="flex gap-2">
            <button 
                onClick={() => setFilter('current')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${filter === 'current' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Current App
            </button>
            <button 
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${filter === 'all' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                All Files
            </button>
          </div>
          <button onClick={loadFiles} className="text-slate-400 hover:text-primary-600" title="Refresh">
             <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Error State */}
        {error && (
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-start gap-3">
               <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
               <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-700">Connection Failed</h3>
                  <p className="text-xs text-red-600 mt-1">{error}</p>
                  <button onClick={() => setShowConfig(true)} className="text-[11px] font-bold text-red-700 underline mt-2 hover:text-red-900">
                     Check Server URL
                  </button>
               </div>
            </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/50">
          {!error && filteredFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 text-slate-400">
              <HardDrive className="w-12 h-12 opacity-20" />
              <p className="text-xs">No files found.</p>
            </div>
          ) : (
            filteredFiles.map(file => (
              <div key={file.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-primary-200 hover:shadow-md transition-all group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-start gap-3 overflow-hidden">
                    <div className="mt-0.5 bg-slate-50 p-1.5 rounded-md border border-slate-100">
                      {getIcon(file.module)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] font-bold text-slate-800 truncate block w-full" title={file.name}>{file.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[9px] font-bold uppercase px-1.5 rounded-sm ${
                          file.type === 'source' ? 'bg-slate-100 text-slate-500' : 
                          file.type === 'destination' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                        }`}>
                          {file.type}
                        </span>
                        <span className="text-[10px] text-slate-400">{formatSize(file.size)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => handleDownload(e, file)} title="Download" className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-primary-600">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => handleDelete(e, file.id)} title="Delete" className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-50 pt-2 mt-1">
                   <span className="text-[10px] text-slate-400">{new Date(file.createdAt).toLocaleString()}</span>
                   {file.module === activeModule && file.type !== 'log' && (
                     <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => onLoadFile(file)}>
                       Load File <ArrowRight className="w-3 h-3 ml-1" />
                     </Button>
                   )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
