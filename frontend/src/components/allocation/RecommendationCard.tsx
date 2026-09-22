import React from 'react';
import type { HospitalRecommendation } from '../../types/allocation';
import { Award, Clock, MapPin, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

interface RecommendationCardProps {
  rank: number;
  recommendation: HospitalRecommendation;
  isPending: boolean;
  isSubmitting: boolean;
  onRequestConfirmation: (hospitalId: number) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  rank,
  recommendation,
  isPending,
  isSubmitting,
  onRequestConfirmation,
}) => {
  const freshnessColors: Record<string, string> = {
    VERY_FRESH: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    FRESH: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    AGING: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    STALE: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  };

  const freshnessClass = freshnessColors[recommendation.freshness_status] || freshnessColors.FRESH;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        isPending
          ? 'bg-amber-950/20 border-amber-500/40 shadow-xl shadow-amber-500/5'
          : rank === 1
          ? 'bg-slate-900/90 border-emerald-500/40 shadow-xl shadow-emerald-500/5'
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Top Banner Bar */}
      <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${
              rank === 1
                ? 'bg-gradient-to-tr from-amber-500 to-emerald-400 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            #{rank}
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-lg tracking-tight">
              {recommendation.hospital_name}
            </h3>
            <p className="text-xs text-slate-400">Hospital ID #{recommendation.hospital_id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-black text-white tracking-tight">
              {recommendation.final_score.toFixed(1)}
              <span className="text-xs text-slate-400 font-normal ml-0.5">/100</span>
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Final Score
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-950/20">
        <div className="p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Resource Match</span>
          <div className="text-base font-bold text-emerald-400 mt-0.5">
            {recommendation.resource_match_score.toFixed(0)}%
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Travel Time</span>
          <div className="text-base font-bold text-slate-200 mt-0.5 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            {recommendation.estimated_travel_minutes.toFixed(1)} <span className="text-xs font-normal">min</span>
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Distance</span>
          <div className="text-base font-bold text-slate-200 mt-0.5 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-rose-400" />
            {recommendation.distance_km.toFixed(1)} <span className="text-xs font-normal">km</span>
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Data Freshness</span>
          <div className="mt-1">
            <span
              className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${freshnessClass}`}
            >
              {recommendation.freshness_status}
            </span>
          </div>
        </div>
      </div>

      {/* Explanation Section ("Why Recommended?") */}
      <div className="p-5 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-amber-400" /> Why Recommended?
        </h4>

        <ul className="space-y-1.5 text-xs text-slate-300">
          {recommendation.reasons.map((reason, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>

        {/* Action Button / Status Badge */}
        <div className="pt-3 flex items-center justify-between border-t border-slate-800/80">
          {isPending ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold animate-pulse">
              <Clock className="w-4 h-4" /> PENDING HOSPITAL CONFIRMATION
            </div>
          ) : (
            <button
              onClick={() => onRequestConfirmation(recommendation.hospital_id)}
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 transition-all duration-200 shadow-lg shadow-rose-600/20 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending Request...
                </>
              ) : (
                <>
                  REQUEST CONFIRMATION <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
