import React from 'react';
import type { EmergencySeverity } from '../../types/emergency';
import { AlertCircle, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';

export const SeverityBadge: React.FC<{ severity: EmergencySeverity }> = ({ severity }) => {
  const styles: Record<EmergencySeverity, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    LOW: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      icon: <Activity className="w-3 h-3" />,
    },
    MODERATE: {
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-200',
      icon: <AlertCircle className="w-3 h-3" />,
    },
    HIGH: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    CRITICAL: {
      bg: 'bg-rose-50',
      text: 'text-rose-800 font-bold',
      border: 'border-rose-200',
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
