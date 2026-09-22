import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  isConflict?: boolean;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title = 'An Error Occurred',
  message,
  onRetry,
  isConflict = false,
}) => {
  return (
    <div
      className={`p-5 rounded-2xl border flex items-start gap-4 shadow-xl backdrop-blur-md ${
        isConflict
          ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
          : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
      }`}
    >
      <AlertCircle className={`w-6 h-6 shrink-0 mt-0.5 ${isConflict ? 'text-amber-400' : 'text-rose-400'}`} />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-base">{title}</h4>
        <p className="text-xs text-slate-300 mt-1 leading-relaxed font-mono">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/80 text-slate-200 border border-slate-700 hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </button>
        )}
      </div>
    </div>
  );
};
