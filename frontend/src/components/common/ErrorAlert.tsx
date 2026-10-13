import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { formatApiDetail } from '../../services/api';

interface ErrorAlertProps {
  title?: string;
  message: unknown;
  onRetry?: () => void;
  isConflict?: boolean;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title = 'An Error Occurred',
  message,
  onRetry,
  isConflict = false,
}) => {
  const displayMessage = formatApiDetail(message) || 'An unexpected error occurred.';
  return (
    <div
      className={`p-5 rounded-2xl border flex items-start gap-4 shadow-xl backdrop-blur-md ${
        isConflict
        ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-rose-50 border-rose-200 text-rose-900'
      }`}
    >
      <AlertCircle className={`w-6 h-6 shrink-0 mt-0.5 ${isConflict ? 'text-amber-700' : 'text-rose-700'}`} />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-base">{title}</h4>
        <p className="text-sm text-current/90 mt-1 leading-relaxed whitespace-pre-line">{displayMessage}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </button>
        )}
      </div>
    </div>
  );
};
