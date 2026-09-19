import React from 'react';
import { Activity, CheckCircle2, AlertCircle, RefreshCw, Server } from 'lucide-react';
import { useHealthStatus } from '../hooks/useHealthStatus';

export const BackendStatus: React.FC = () => {
  const { data, loading, error, lastChecked, refetch } = useHealthStatus();

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-200 text-lg">Backend API Status</h3>
            <p className="text-xs text-slate-400">FastAPI Server Health Check</p>
          </div>
        </div>

        <button
          onClick={refetch}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-all duration-200 disabled:opacity-50"
          title="Refresh Status"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-400' : ''}`} />
        </button>
      </div>

      <div className="space-y-4">
        {loading && !data && (
          <div className="flex items-center gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800/60 animate-pulse">
            <Activity className="w-5 h-5 text-amber-400 animate-spin" />
            <span className="text-sm text-slate-300 font-medium">Checking backend connectivity...</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-red-400">Connection Failed</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300">
                  Offline
                </span>
              </div>
              <p className="text-xs text-red-300/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {data && (
          <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-emerald-400">Connected</div>
                <div className="text-xs text-emerald-300/80 font-mono mt-0.5">
                  Service: <span className="text-slate-200 font-medium">{data.service}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {data.status.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {lastChecked && (
          <div className="text-right text-[11px] text-slate-500">
            Last checked: {lastChecked.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};
