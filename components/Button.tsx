
import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading,
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-lg font-bold tracking-wide transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] border border-transparent shadow-sm';
  
  const variants = {
    // Punchy Violet Button
    primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-[0_4px_14px_0_rgba(124,58,237,0.39)] border-primary-600',
    // Light Slate Button (White Theme)
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-sm',
    // Outline
    outline: 'bg-transparent border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900',
    // Ghost
    ghost: 'bg-transparent text-slate-500 hover:text-primary-600 hover:bg-primary-50 shadow-none',
    // Destructive
    destructive: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300'
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-5 text-sm',
    lg: 'h-12 px-8 text-base',
  };

  const finalClassName = twMerge(clsx(baseStyles, variants[variant], sizes[size], className));

  return (
    <button
      className={finalClassName}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="opacity-90">Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
