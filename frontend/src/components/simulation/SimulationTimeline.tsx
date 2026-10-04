import React from 'react';
import { CheckCircle2, Clock, ArrowRight, Lock } from 'lucide-react';

export type SimulationStage = 
  | 'CREATED'
  | 'REQUIREMENTS_IDENTIFIED'
  | 'EVALUATED'
  | 'RANKED'
  | 'SELECTED'
  | 'RESERVED'
  | 'HANDOVER';

const STAGES: { key: SimulationStage; title: string; description: string }[] = [
  { key: 'CREATED', title: 'Emergency Created', description: 'Incident registered in dispatch grid' },
  { key: 'REQUIREMENTS_IDENTIFIED', title: 'Requirements Matched', description: 'Resource requirements & severity parsed' },
  { key: 'EVALUATED', title: 'Hospitals Evaluated', description: 'Filtered active candidate facilities' },
  { key: 'RANKED', title: 'Hospitals Ranked', description: '4-part deterministic engine score computed' },
  { key: 'SELECTED', title: 'Destination Selected', description: 'Rank #1 recommended hospital targeted' },
  { key: 'RESERVED', title: 'Resource Reserved', description: 'Atomic reservation lock confirmed' },
  { key: 'HANDOVER', title: 'Handover Initiated', description: 'Ambulance en route & staff notified' },
];

interface SimulationTimelineProps {
  currentStage: SimulationStage;
  onReserveResource?: () => void;
  isReserving?: boolean;
}

export const SimulationTimeline: React.FC<SimulationTimelineProps> = ({
  currentStage,
  onReserveResource,
  isReserving = false,
}) => {
  const getStageIndex = (stage: SimulationStage) => {
    return STAGES.findIndex((s) => s.key === stage);
  };

  const currentIndex = getStageIndex(currentStage);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Simulation Workflow Timeline</h2>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
          Stage {currentIndex + 1} of 7
        </span>
      </div>

      {/* Horizontal / Stacked Timeline Progress Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div
              key={stage.key}
              className={`p-3 rounded-xl border flex flex-col justify-between transition-all duration-300 ${
                isCurrent
                  ? 'bg-rose-500/10 border-rose-500/50 shadow-lg shadow-rose-500/10 scale-102'
                  : isCompleted
                  ? 'bg-slate-950/80 border-slate-800 text-slate-300'
                  : 'bg-slate-950/40 border-slate-900 text-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] font-bold text-slate-500">0{idx + 1}</span>
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : isCurrent ? (
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-800 shrink-0" />
                )}
              </div>
              <div>
                <h4
                  className={`text-[11px] font-bold tracking-tight ${
                    isCurrent ? 'text-rose-300' : isCompleted ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  {stage.title}
                </h4>
                <p className="text-[9px] text-slate-500 mt-0.5 line-clamp-2">{stage.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Prompt for Advancing Stage */}
      {currentIndex === 4 && onReserveResource && (
        <div className="pt-2 flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Target hospital selected. Ready for atomic resource reservation lock.</span>
          </div>
          <button
            onClick={onReserveResource}
            disabled={isReserving}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            {isReserving ? 'RESERVING...' : 'RESERVE RESOURCE NOW'}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
