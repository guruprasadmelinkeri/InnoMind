import React from 'react';
import type { HospitalResource } from '../../types/hospital';
import { Bed, Activity, Stethoscope, Wind, ShieldAlert, HeartPulse, Clock } from 'lucide-react';

export const ResourceCard: React.FC<{ resource: HospitalResource }> = ({ resource }) => {
  const icons: Record<string, React.ReactNode> = {
    ICU_BED: <Activity className="w-5 h-5 text-rose-400" />,
    GENERAL_BED: <Bed className="w-5 h-5 text-sky-400" />,
    VENTILATOR: <Wind className="w-5 h-5 text-amber-400" />,
    OXYGEN_BED: <HeartPulse className="w-5 h-5 text-emerald-400" />,
    TRAUMA_BED: <ShieldAlert className="w-5 h-5 text-purple-400" />,
    OPERATING_ROOM: <Stethoscope className="w-5 h-5 text-indigo-400" />,
  };

  const labels: Record<string, string> = {
    ICU_BED: 'ICU Beds',
    GENERAL_BED: 'General Beds',
    VENTILATOR: 'Ventilators',
    OXYGEN_BED: 'Oxygen Beds',
    TRAUMA_BED: 'Trauma Beds',
    OPERATING_ROOM: 'Operating Rooms',
  };

  const icon = icons[resource.resource_type] || <Bed className="w-5 h-5 text-slate-400" />;
  const label = labels[resource.resource_type] || resource.resource_type;

  // Calculate percentage available
  const availablePercent = resource.total > 0 ? Math.round((resource.available / resource.total) * 100) : 0;

  return (
    <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 shadow-xl transition-all space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">{icon}</div>
          <div>
            <h4 className="font-bold text-slate-100 text-sm">{label}</h4>
            <span className="text-[10px] uppercase font-semibold text-slate-400">Total: {resource.total}</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-2xl font-black text-emerald-400">{resource.available}</span>
          <span className="text-xs text-slate-500 font-medium"> / {resource.total}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden flex border border-slate-800">
          <div
            className="bg-emerald-500 h-full transition-all duration-500"
            style={{ width: `${availablePercent}%` }}
            title={`Available: ${resource.available}`}
          />
          <div
            className="bg-amber-500 h-full transition-all duration-500"
            style={{
              width: `${resource.total > 0 ? (resource.reserved / resource.total) * 100 : 0}%`,
            }}
            title={`Reserved: ${resource.reserved}`}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Available: {resource.available}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Reserved: {resource.reserved}
          </span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> Updated:
        </span>
        <span>{new Date(resource.last_updated).toLocaleTimeString()}</span>
      </div>
    </div>
  );
};
