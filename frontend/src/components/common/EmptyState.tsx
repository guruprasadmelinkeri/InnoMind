import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Inbox className="w-10 h-10 text-slate-500" />,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
      <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800">{icon}</div>
      <h3 className="font-semibold text-slate-200 text-base">{title}</h3>
      {description && <p className="text-xs text-slate-400 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
};
