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
    VERY_FRESH: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    FRESH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    AGING: 'bg-amber-50 text-amber-800 border-amber-200',
    STALE: 'bg-rose-50 text-rose-800 border-rose-200',
  };

  const freshnessClass = freshnessColors[recommendation.freshness_status] || freshnessColors.FRESH;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        isPending
          ? 'bg-amber-50 border-amber-300 shadow-sm shadow-amber-900/5'
          : rank === 1
          ? 'bg-white border-teal-300 shadow-md shadow-teal-900/5 ring-1 ring-teal-100'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Top Banner Bar */}
      <div className={`flex items-center justify-between gap-4 p-5 border-b ${isPending ? 'border-amber-200 bg-amber-100/60' : rank === 1 ? 'border-teal-100 bg-teal-50/70' : 'border-slate-100 bg-slate-50/70'}`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${
              rank === 1
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            #{rank}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg tracking-tight">
              {recommendation.hospital_name}
            </h3>
            <p className="text-xs text-slate-400">Hospital ID #{recommendation.hospital_id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {recommendation.final_score.toFixed(1)}
              <span className="text-xs text-slate-500 font-normal ml-0.5">/100</span>
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Final Score
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Resource Match</span>
          <div className="text-base font-bold text-teal-700 mt-0.5">
            {recommendation.resource_match_score.toFixed(0)}%
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Travel Time</span>
          <div className="text-base font-bold text-slate-800 mt-0.5 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            {recommendation.estimated_travel_minutes.toFixed(1)} <span className="text-xs font-normal">min</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[10px] uppercase font-semibold text-slate-400">Distance</span>
          <div className="text-base font-bold text-slate-800 mt-0.5 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            {recommendation.distance_km.toFixed(1)} <span className="text-xs font-normal">km</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
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
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-teal-700" /> Why Recommended?
        </h4>

        <ul className="space-y-1.5 text-xs text-slate-700">
          {recommendation.reasons.map((reason, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>

        {/* Action Button / Status Badge */}
        <div className="pt-3 flex items-center justify-between border-t border-slate-200">
          {isPending ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold">
              <Clock className="w-4 h-4" /> PENDING HOSPITAL CONFIRMATION
            </div>
          ) : (
            <button
              onClick={() => onRequestConfirmation(recommendation.hospital_id)}
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-sm shadow-teal-900/10 disabled:opacity-50 cursor-pointer"
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
