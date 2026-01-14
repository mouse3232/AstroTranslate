
import React, { useState, useRef, useEffect } from 'react';
import { Search, CheckSquare, Square, ChevronDown, X } from 'lucide-react';
import { Button } from './Button';

interface TableSelectorProps {
  tables: string[];
  selectedTables: string[];
  onChange: (tables: string[]) => void;
  disabled?: boolean;
}

export const TableSelector: React.FC<TableSelectorProps> = ({ tables, selectedTables, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTables = tables.filter(t => 
    t.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleTable = (table: string) => {
    if (selectedTables.includes(table)) {
      onChange(selectedTables.filter(t => t !== table));
    } else {
      onChange([...selectedTables, table]);
    }
  };

  const selectAll = () => {
    // Select all visible (filtered) tables
    const unique = Array.from(new Set([...selectedTables, ...filteredTables]));
    onChange(unique);
  };

  const deselectAll = () => {
    // Deselect visible (filtered) tables
    onChange(selectedTables.filter(t => !filteredTables.includes(t)));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center justify-between gap-2 px-2 h-7 bg-white border border-slate-300 rounded-md text-[11px] font-bold text-slate-700 min-w-[180px] hover:border-primary-500 hover:bg-slate-50 transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="truncate max-w-[140px]">
          {selectedTables.length === 0 
            ? 'Select Tables' 
            : selectedTables.length === 1 
              ? selectedTables[0] 
              : `${selectedTables.length} Tables Selected`}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 border-b border-slate-100 bg-slate-50/50 space-y-2">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search tables..." 
                className="w-full pl-8 pr-2 py-1 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="flex-1 text-[10px] font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 py-0.5 rounded transition-colors">Select All</button>
              <button onClick={deselectAll} className="flex-1 text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-0.5 rounded transition-colors">Clear</button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
            {filteredTables.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-slate-400">No tables found</div>
            ) : (
                filteredTables.map(table => {
                    const isSelected = selectedTables.includes(table);
                    return (
                        <div 
                            key={table} 
                            onClick={() => toggleTable(table)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-[11px] font-medium ${isSelected ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            {isSelected ? <CheckSquare className="w-3 h-3 text-primary-600 shrink-0" /> : <Square className="w-3 h-3 text-slate-300 shrink-0" />}
                            <span className="truncate" title={table}>{table}</span>
                        </div>
                    );
                })
            )}
          </div>
          <div className="p-1.5 border-t border-slate-100 bg-slate-50 text-[9px] text-slate-400 text-center">
            {selectedTables.length} of {tables.length} selected
          </div>
        </div>
      )}
    </div>
  );
};
