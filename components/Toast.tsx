
import React, { useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastItemProps extends ToastMessage {
  onClose: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ id, type, message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), 4000); // Auto dismiss after 4s
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />
  };

  const styles = {
    success: 'bg-white border-green-200 shadow-green-500/10',
    error: 'bg-white border-red-200 shadow-red-500/10',
    info: 'bg-white border-blue-200 shadow-blue-500/10'
  };

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border shadow-lg min-w-[320px] max-w-md animate-in slide-in-from-right duration-300 ${styles[type]}`}>
      <div className="shrink-0">{icons[type]}</div>
      <p className="flex-1 text-sm font-bold text-slate-700">{message}</p>
      <button onClick={() => onClose(id)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-50 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer = ({ toasts, removeToast }: { toasts: ToastMessage[], removeToast: (id: string) => void }) => (
  <div className="fixed bottom-8 right-8 z-[9999] flex flex-col gap-3 pointer-events-none">
    {toasts.map(t => (
      <div key={t.id} className="pointer-events-auto">
        <ToastItem {...t} onClose={removeToast} />
      </div>
    ))}
  </div>
);
