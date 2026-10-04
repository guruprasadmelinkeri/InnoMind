import React from 'react';
import { Award, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import type { HospitalRecommendation } from '../../types/allocation';

interface AllocationDecisionPanelProps {
  topRecommendation: HospitalRecommendation | null;
  ineligibleCount?: number;
}

export const AllocationDecisionPanel: React.FC<AllocationDecisionPanelProps> = ({
  topRecommendation,
}) => {
  if (!topRecommendation) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl text-center space-y-4 backdrop-blur-md">
        <div className="p-3 bg-rose-500/10 rounded-full w-12 h-12 mx-auto flex items-center justify-center text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white">No Eligible Hospital Found</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          None of the active hospitals satisfy all mandatory resource requirements or certified specialization criteria for this emergency scenario.
        </p>
      </div>
    );
  }

  const {
    hospital_name,
    final_score,
    resource_match_score,
    travel_score,
    freshness_score,
    specialization_score,
    distance_km,
    estimated_travel_minutes,
    freshness_status,
    reasons,
  } = topRecommendation;

  // Format Dynamic "Why This Hospital?" Explanation from actual returned properties
  const generateWhyExplanation = () => {
    const freshDesc =
      freshness_status === 'VERY_FRESH'
        ? 'has 100% fresh real-time resource data (<30s old)'
        : freshness_status === 'FRESH'
        ? 'has fresh resource data (<2 mins old)'
        : freshness_status === 'AGING'
        ? 'has aging resource data (<5 mins old)'
        : 'has stale resource data (>5 mins old)';

    return `${hospital_name} was selected because it achieves a ${resource_match_score}% resource match, provides the shortest estimated travel time (${estimated_travel_minutes} mins / ${distance_km} km), and ${freshDesc}.`;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-6 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Allocation Decision</h2>
        </div>
        <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
          RANK #1 TARGET
        </span>
      </div>

      {/* Recommended Hospital Title Card */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 shadow-inner space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Top Recommended Destination</span>
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> MATCHED
          </span>
        </div>
        <h3 className="text-xl font-black text-white tracking-tight">{hospital_name}</h3>
        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <span>⚡ {estimated_travel_minutes} min ETA</span>
          <span>•</span>
          <span>📍 {distance_km} km distance</span>
        </div>
      </div>

      {/* Progress Bars Score Breakdown */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-slate-300">Determinant Score Breakdown</span>
          <span className="text-rose-400 font-mono font-bold text-sm">{final_score}% Final Score</span>
        </div>

        <div className="space-y-2.5 font-mono text-xs">
          {/* Resource Match Bar (45%) */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Resource Match (45% Weight)</span>
              <span className="text-emerald-400 font-bold">{resource_match_score}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, resource_match_score))}%` }}
              />
            </div>
          </div>

          {/* Travel Time Bar (30%) */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Travel Score (30% Weight)</span>
              <span className="text-sky-400 font-bold">{travel_score}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, travel_score))}%` }}
              />
            </div>
          </div>

          {/* Data Freshness Bar (15%) */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Data Freshness (15% Weight)</span>
              <span className={`font-bold ${freshness_score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {freshness_score}% ({freshness_status})
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  freshness_score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, freshness_score))}%` }}
              />
            </div>
          </div>

          {/* Specialization Bar (10%) */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Specialization (10% Weight)</span>
              <span className="text-amber-400 font-bold">{specialization_score}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, specialization_score))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* "Why This Hospital?" Explanation Card */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
        <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wide">
          <Info className="w-4 h-4" />
          <span>Why This Hospital?</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          "{generateWhyExplanation()}"
        </p>

        {reasons.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Engine Key Reasons:</span>
            <ul className="text-[11px] text-slate-400 space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Deterministic Engine Footnote */}
      <p className="text-[10px] text-slate-500 text-center font-mono">
        Formula: 45% Resource Match + 30% Travel Time + 15% Freshness + 10% Specialization
      </p>
    </div>
  );
};
