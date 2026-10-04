import React from 'react';
import { Building2, Activity, ShieldAlert, Lock, Clock, RotateCcw } from 'lucide-react';
import type { Hospital } from '../../types/hospital';
import type { EmergencyCase } from '../../types/emergency';
import type { Reservation } from '../../types/reservation';

interface SimulationMetricsHeaderProps {
  hospitals: Hospital[];
  emergencies: EmergencyCase[];
  reservations: Reservation[];
  lastUpdatedTime: Date | null;
  onResetSimulation: () => void;
  isResetting?: boolean;
}

export const SimulationMetricsHeader: React.FC<SimulationMetricsHeaderProps> = ({
  hospitals,
  emergencies,
  reservations,
  lastUpdatedTime,
  onResetSimulation,
  isResetting = false,
}) => {
  // Compute metric counts
  const onlineHospitals = hospitals.filter((h) => h.status === 'Active').length;
  const totalHospitals = hospitals.length;

  const totalAvailableResources = hospitals.reduce((acc, h) => {
    if (h.status !== 'Active' || !h.resources) return acc;
    return acc + h.resources.reduce((rAcc, r) => rAcc + r.available, 0);
  }, 0);

  const activeEmergenciesCount = emergencies.filter(
    (e) => e.status !== 'HANDOFF_COMPLETED' && e.status !== 'CANCELLED'
  ).length;

  const activeReservationsCount = reservations.filter(
    (r) => r.status === 'HELD' || r.status === 'CONFIRMED'
  ).length;

  // Format relative seconds
  const getSecondsAgo = () => {
    if (!lastUpdatedTime) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - lastUpdatedTime.getTime()) / 1000));
    if (diffSec < 5) return 'Just now';
    return `${diffSec}s ago`;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Title & Status */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-rose-500/30 rounded-2xl shrink-0">
            <Activity className="w-6 h-6 text-rose-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                MediRoute Simulation Lab
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">
                Interactive EOC Mode
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-Time Emergency Scenario & Deterministic Allocation Engine Simulator
            </p>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
          {/* Hospitals Online */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-sky-400 text-xs font-semibold">
              <span>Hospitals</span>
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-white">{onlineHospitals}</span>
              <span className="text-[11px] text-slate-500 font-medium">/ {totalHospitals} online</span>
            </div>
          </div>

          {/* Resources Available */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
              <span>Resources</span>
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-emerald-400">{totalAvailableResources}</span>
              <span className="text-[11px] text-slate-500 font-medium">available</span>
            </div>
          </div>

          {/* Active Emergencies */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-400 text-xs font-semibold">
              <span>Emergencies</span>
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-white">{activeEmergenciesCount}</span>
              <span className="text-[11px] text-slate-500 font-medium">active</span>
            </div>
          </div>

          {/* Reservations */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
              <span>Reservations</span>
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-amber-400">{activeReservationsCount}</span>
              <span className="text-[11px] text-slate-500 font-medium">reserved</span>
            </div>
          </div>

          {/* Last Update */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Live Engine</span>
              <Clock className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '4s' }} />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xs font-mono font-semibold text-emerald-400">{getSecondsAgo()}</span>
            </div>
          </div>
        </div>

        {/* Reset Action */}
        <div className="shrink-0 flex items-center justify-end">
          <button
            onClick={onResetSimulation}
            disabled={isResetting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all duration-200 shadow-md active:scale-95 disabled:opacity-50"
            title="Reset hospital resources and statuses to baseline seed values"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset Demo Baseline</span>
          </button>
        </div>
      </div>
    </div>
  );
};
