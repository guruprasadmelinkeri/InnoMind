import React from 'react';
import type { HospitalRecommendation } from '../../types/allocation';
import { AlertOctagon, XCircle } from 'lucide-react';

export const IneligibleCard: React.FC<{ recommendation: HospitalRecommendation }> = ({ recommendation }) => {
  return (
    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2 hover:border-rose-300 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-rose-700 shrink-0" />
          <h4 className="font-semibold text-slate-900 text-sm">{recommendation.hospital_name}</h4>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-rose-800 border border-rose-200">
          INCOMPATIBLE
        </span>
      </div>

      <ul className="space-y-1 text-xs text-rose-900">
        {recommendation.reasons.map((reason, idx) => (
          <li key={idx} className="flex items-start gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-rose-700 shrink-0 mt-0.5" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
