import React from 'react';
import type { EmergencyStatus } from '../../types/emergency';
import { Clock, Search, CheckCircle2, Navigation, MapPin, Flag, XCircle } from 'lucide-react';

export const StatusBadge: React.FC<{ status: EmergencyStatus }> = ({ status }) => {
  const styles: Record<EmergencyStatus, { bg: string; text: string; border: string; label: string; icon: React.ReactNode }> = {
    CREATED: {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
      label: 'Created',
      icon: <Clock className="w-3 h-3" />,
    },
    SEARCHING: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      label: 'Searching',
      icon: <Search className="w-3 h-3 animate-spin" />,
    },
    HOSPITAL_SELECTED: {
      bg: 'bg-teal-50',
      text: 'text-teal-800',
      border: 'border-teal-200',
      label: 'Hospital Selected',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    EN_ROUTE: {
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-200',
      label: 'En Route',
      icon: <Navigation className="w-3 h-3" />,
    },
    ARRIVED: {
      bg: 'bg-cyan-50',
      text: 'text-cyan-800',
      border: 'border-cyan-200',
      label: 'Arrived',
      icon: <MapPin className="w-3 h-3" />,
    },
    HANDOFF_COMPLETED: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-800 font-semibold',
      border: 'border-emerald-200',
      label: 'Completed',
      icon: <Flag className="w-3 h-3" />,
    },
    CANCELLED: {
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      label: 'Cancelled',
      icon: <XCircle className="w-3 h-3" />,
    },
  };

  const style = styles[status] || styles.CREATED;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}
    >
      {style.icon}
      {style.label}
    </span>
  );
};
