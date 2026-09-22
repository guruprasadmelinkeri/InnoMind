import React from 'react';
import type { EmergencySeverity } from '../../types/emergency';
import { AlertCircle, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';

export const SeverityBadge: React.FC<{ severity: EmergencySeverity }> = ({ severity }) => {
  const styles: Record<EmergencySeverity, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    LOW: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-300',
      border: 'border-emerald-500/20',
      icon: <Activity className="w-3 h-3" />,
    },
    MODERATE: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-300',
      border: 'border-sky-500/20',
      icon: <AlertCircle className="w-3 h-3" />,
    },
    HIGH: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-300',
      border: 'border-amber-500/20',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    CRITICAL: {
      bg: 'bg-rose-500/15',
      text: 'text-rose-400 font-bold animate-pulse',
      border: 'border-rose-500/30',
      icon: <ShieldAlert className="w-3 h-3" />,
    },
  };

  const style = styles[severity] || styles.MODERATE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}
    >
      {style.icon}
      {severity}
    </span>
  );
};
