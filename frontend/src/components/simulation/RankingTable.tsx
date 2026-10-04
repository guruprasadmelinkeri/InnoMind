import React from 'react';
import { Building2, Award } from 'lucide-react';
import type { HospitalRecommendation } from '../../types/allocation';
import type { Hospital } from '../../types/hospital';

interface RankingTableProps {
  recommendations: HospitalRecommendation[];
  ineligibleHospitals: HospitalRecommendation[];
  hospitals: Hospital[];
  selectedHospitalId: number | null;
  onSelectHospital: (hospitalId: number) => void;
}

export const RankingTable: React.FC<RankingTableProps> = ({
  recommendations,
  ineligibleHospitals,
  hospitals,
  selectedHospitalId,
  onSelectHospital,
}) => {
  // Combine all hospitals for complete table view
  const allHospitalRows = [
    ...recommendations.map((r, idx) => ({ ...r, rank: idx + 1, isEligible: true })),
    ...ineligibleHospitals.map((r) => ({ ...r, rank: null, isEligible: false })),
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 backdrop-blur-md">
      {/* Table Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Live Comparative Hospital Rankings</h2>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
          {allHospitalRows.length} Evaluated
        </span>
      </div>

      {/* Table Area */}
      <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950">
        <table className="w-full text-left text-xs text-slate-300 font-sans">
          <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
            <tr>
              <th className="p-3">Rank</th>
              <th className="p-3">Hospital Name</th>
              <th className="p-3">Resource Match</th>
              <th className="p-3">Travel Time</th>
              <th className="p-3">Data Freshness</th>
              <th className="p-3">Specialization</th>
              <th className="p-3">Total Score</th>
              <th className="p-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {allHospitalRows.map((row) => {
              const isSelected = selectedHospitalId === row.hospital_id;
              const hospitalObj = hospitals.find((h) => h.id === row.hospital_id);

              return (
                <tr
                  key={row.hospital_id}
                  onClick={() => onSelectHospital(row.hospital_id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-rose-500/10 border-l-4 border-l-rose-500 text-white font-semibold'
                      : row.isEligible
                      ? 'hover:bg-slate-900/80 text-slate-200'
                      : 'bg-slate-950/40 opacity-60 text-slate-500 hover:opacity-80'
                  }`}
                >
                  {/* Rank */}
                  <td className="p-3 font-bold">
                    {row.rank ? (
                      <span className={`px-2 py-0.5 rounded-md font-mono ${
                        row.rank === 1 ? 'bg-rose-500 text-white font-black' : 'bg-slate-800 text-slate-300'
                      }`}>
                        #{row.rank}
                      </span>
                    ) : (
                      <span className="text-slate-600 font-mono">—</span>
                    )}
                  </td>

                  {/* Hospital Name & Trauma Center Badge */}
                  <td className="p-3 font-sans font-bold">
                    <div className="flex items-center gap-2">
                      <Building2 className={`w-4 h-4 shrink-0 ${row.rank === 1 ? 'text-rose-400' : 'text-slate-400'}`} />
                      <span>{row.hospital_name}</span>
                      {hospitalObj?.trauma_center && (
                        <span className="px-1.5 py-0.2 text-[9px] rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          TRAUMA
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Resource Match % */}
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${row.resource_match_score === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {row.resource_match_score}%
                      </span>
                      <div className="w-12 h-1.5 rounded-full bg-slate-900 overflow-hidden hidden sm:block">
                        <div
                          className={`h-full ${row.resource_match_score === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${row.resource_match_score}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Travel Time & Distance */}
                  <td className="p-3">
                    <span className="text-sky-300 font-semibold">{row.estimated_travel_minutes} min</span>
                    <span className="text-slate-500 text-[10px] ml-1">({row.distance_km} km)</span>
                  </td>

                  {/* Data Freshness Badge */}
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        row.freshness_status === 'VERY_FRESH'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : row.freshness_status === 'FRESH'
                          ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                          : row.freshness_status === 'AGING'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {row.freshness_status} ({row.freshness_score}%)
                    </span>
                  </td>

                  {/* Specialization */}
                  <td className="p-3 text-slate-300 font-semibold">
                    {row.specialization_score}%
                  </td>

                  {/* Total Score */}
                  <td className="p-3 font-bold text-rose-400 font-mono text-xs">
                    {row.final_score}%
                  </td>

                  {/* Status Badge */}
                  <td className="p-3 text-right">
                    {row.rank === 1 ? (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-600 text-white shadow-md">
                        SELECTED
                      </span>
                    ) : row.isEligible ? (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        ELIGIBLE
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 text-slate-500 border border-slate-800">
                        INELIGIBLE
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
