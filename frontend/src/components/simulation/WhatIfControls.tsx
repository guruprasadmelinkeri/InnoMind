import React from 'react';
import { Zap, AlertTriangle, PowerOff, Clock, Lock, ArrowRight } from 'lucide-react';

interface WhatIfControlsProps {
  onRemoveResource: () => void;
  onToggleHospitalOffline: () => void;
  onSimulateStaleData: () => void;
  onSimulateSimultaneousRequests: () => void;
  allocationChangeLog: {
    previousHospital: string;
    newHospital: string;
    reason: string;
  } | null;
  simultaneousResults: {
    requestA: { status: 'ACCEPTED'; hospital: string };
    requestB: { status: 'REJECTED'; reason: string };
  } | null;
  isExecuting?: boolean;
}

export const WhatIfControls: React.FC<WhatIfControlsProps> = ({
  onRemoveResource,
  onToggleHospitalOffline,
  onSimulateStaleData,
  onSimulateSimultaneousRequests,
  allocationChangeLog,
  simultaneousResults,
  isExecuting = false,
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 backdrop-blur-md">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">"What If?" Simulation Scenarios</h2>
        </div>
        <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
          Dynamic Stress Testing
        </span>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Scenario 1: Remove Resource */}
        <button
          onClick={onRemoveResource}
          disabled={isExecuting}
          className="flex flex-col text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-500/50 hover:bg-rose-500/5 transition-all duration-200 group active:scale-98 disabled:opacity-50"
        >
          <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
            <span>Remove ICU Bed</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
            Set ICU availability to 0 at top hospital to trigger allocation fallback.
          </p>
        </button>

        {/* Scenario 2: Take Hospital Offline */}
        <button
          onClick={onToggleHospitalOffline}
          disabled={isExecuting}
          className="flex flex-col text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all duration-200 group active:scale-98 disabled:opacity-50"
        >
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
            <PowerOff className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
            <span>Take Hospital Offline</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
            Simulate network outage or emergency closure of top candidate facility.
          </p>
        </button>

        {/* Scenario 3: Simulate Stale Data */}
        <button
          onClick={onSimulateStaleData}
          disabled={isExecuting}
          className="flex flex-col text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500/50 hover:bg-sky-500/5 transition-all duration-200 group active:scale-98 disabled:opacity-50"
        >
          <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
            <Clock className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
            <span>Simulate Stale Data</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
            Age resource timestamp to 15m ago & demonstrate freshness penalty.
          </p>
        </button>

        {/* Scenario 4: Simultaneous Requests */}
        <button
          onClick={onSimulateSimultaneousRequests}
          disabled={isExecuting}
          className="flex flex-col text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-200 group active:scale-98 disabled:opacity-50"
        >
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
            <Lock className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" />
            <span>Simultaneous Requests</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
            Test atomic reservation lock: Request A accepts, Request B gets blocked.
          </p>
        </button>
      </div>

      {/* Allocation Changed Notification Banner */}
      {allocationChangeLog && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 via-slate-950 to-amber-950/40 border border-rose-500/40 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-400 tracking-wide uppercase flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 fill-rose-400" /> ALLOCATION RE-CALCULATED
            </span>
            <span className="text-[10px] font-mono text-slate-400">Live Reaction</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-400">Previous:</span>
              <span className="font-bold text-slate-300 line-through">{allocationChangeLog.previousHospital}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-rose-400 hidden sm:inline" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-400">New Target:</span>
              <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                {allocationChangeLog.newHospital}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-300 pt-1 border-t border-slate-800">
            <span className="font-bold text-amber-400">Reason:</span> "{allocationChangeLog.reason}"
          </p>
        </div>
      )}

      {/* Simultaneous Requests Lock Result Banner */}
      {simultaneousResults && (
        <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-400 tracking-wide uppercase flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" /> ATOMIC DOUBLE-BOOKING PROTECTION DEMONSTRATED
            </span>
            <span className="text-[10px] font-mono text-slate-400">Atomic Lock Active</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
              <div className="font-bold mb-1">Ambulance Request #1</div>
              <div>Status: ACCEPTED</div>
              <div className="text-[11px] text-emerald-400/80">Resource atomically reserved at {simultaneousResults.requestA.hospital}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300">
              <div className="font-bold mb-1">Ambulance Request #2</div>
              <div>Status: REJECTED</div>
              <div className="text-[11px] text-rose-400/80">Reason: {simultaneousResults.requestB.reason}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
