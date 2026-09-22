import React from 'react';
import type { EmergencyStatus } from '../../types/emergency';
import { Clock, Search, CheckCircle2, Navigation, MapPin, Flag, XCircle } from 'lucide-react';

export const StatusBadge: React.FC<{ status: EmergencyStatus }> = ({ status }) => {
  const styles: Record<EmergencyStatus, { bg: string; text: string; border: string; label: string; icon: React.ReactNode }> = {
    CREATED: {
      bg: 'bg-slate-800/80',
      text: 'text-slate-300',
      border: 'border-slate-700',
      label: 'Created',
      icon: <Clock className="w-3 h-3" />,
    },
    SEARCHING: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-300',
      border: 'border-amber-500/20',
      label: 'Searching',
      icon: <Search className="w-3 h-3 animate-spin" />,
    },
    HOSPITAL_SELECTED: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-300',
      border: 'border-emerald-500/20',
      label: 'Hospital Selected',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    EN_ROUTE: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-300',
      border: 'border-sky-500/20',
      label: 'En Route',
      icon: <Navigation className="w-3 h-3" />,
    },
    ARRIVED: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-300',
      border: 'border-purple-500/20',
      label: 'Arrived',
      icon: <MapPin className="w-3 h-3" />,
    },
    HANDOFF_COMPLETED: {
      bg: 'bg-emerald-500/20',
      text: 'text-emerald-400 font-semibold',
      border: 'border-emerald-500/40',
      label: 'Completed',
      icon: <Flag className="w-3 h-3" />,
    },
    CANCELLED: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/20',
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
