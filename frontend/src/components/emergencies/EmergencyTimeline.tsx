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
    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-2">
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
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : step.isCurrent
                  ? 'bg-teal-50 border-teal-300 text-teal-950 ring-1 ring-teal-100'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <div className="mb-2">
                {step.isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                ) : step.isCurrent ? (
                  <Icon className="w-5 h-5 text-teal-700" />
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
