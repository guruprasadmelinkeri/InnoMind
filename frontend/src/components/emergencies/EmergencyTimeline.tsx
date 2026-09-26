import React from 'react';
import { CheckCircle2, Circle, Truck, Building2, UserCheck, CheckCheck, Clock } from 'lucide-react';
import type { EmergencyStatus } from '../../types/emergency';
import type { HandoffStatus } from '../../types/handoff';

interface EmergencyTimelineProps {
  status: EmergencyStatus;
  handoffStatus?: HandoffStatus;
}

export const EmergencyTimeline: React.FC<EmergencyTimelineProps> = ({ status, handoffStatus }) => {
  const steps = [
    {
      id: 'HOSPITAL_SELECTED',
      label: 'Hospital Selected & Reserved',
      icon: Building2,
      isDone: ['HOSPITAL_SELECTED', 'EN_ROUTE', 'ARRIVED', 'HANDOFF_COMPLETED'].includes(status),
      isCurrent: status === 'HOSPITAL_SELECTED',
    },
    {
      id: 'AMBULANCE_ASSIGNED',
      label: 'Ambulance Assigned',
      icon: Truck,
      isDone: ['EN_ROUTE', 'ARRIVED', 'HANDOFF_COMPLETED'].includes(status),
      isCurrent: status === 'EN_ROUTE',
    },
    {
      id: 'EN_ROUTE',
      label: 'Ambulance En Route',
      icon: Clock,
      isDone: ['EN_ROUTE', 'ARRIVED', 'HANDOFF_COMPLETED'].includes(status),
      isCurrent: status === 'EN_ROUTE',
    },
    {
      id: 'ARRIVED',
      label: 'Arrived at Hospital',
      icon: CheckCircle2,
      isDone: ['ARRIVED', 'HANDOFF_COMPLETED'].includes(status),
      isCurrent: status === 'ARRIVED',
    },
    {
      id: 'HANDOFF',
      label: handoffStatus === 'IN_PROGRESS' ? 'Handoff In Progress' : 'Hospital Handoff',
      icon: UserCheck,
      isDone: status === 'HANDOFF_COMPLETED' || handoffStatus === 'COMPLETED',
      isCurrent: status === 'ARRIVED' && handoffStatus === 'IN_PROGRESS',
    },
    {
      id: 'COMPLETED',
      label: 'Workflow Completed',
      icon: CheckCheck,
      isDone: status === 'HANDOFF_COMPLETED',
      isCurrent: status === 'HANDOFF_COMPLETED',
    },
  ];

  return (
    <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md">
      <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-4 flex items-center gap-2">
        <span>●</span> Live Handoff Progress Timeline
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className={`p-3 rounded-2xl border text-xs flex flex-col items-center text-center transition-all ${
                step.isDone
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : step.isCurrent
                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-200 animate-pulse'
                  : 'bg-slate-950/50 border-slate-800 text-slate-500'
              }`}
            >
              <div className="mb-2">
                {step.isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : step.isCurrent ? (
                  <Icon className="w-5 h-5 text-rose-400" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <span className="font-bold leading-tight">{step.label}</span>
              <span className="text-[10px] mt-1 opacity-75 font-mono">
                {step.isDone ? '✓ Completed' : step.isCurrent ? '● Active' : '○ Pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
