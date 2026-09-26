import React, { useState } from 'react';
import { Truck, CheckCircle2, UserCheck, Loader2, AlertCircle } from 'lucide-react';
import type { EmergencyCase } from '../../types/emergency';
import type { Ambulance } from '../../types/ambulance';
import type { Handoff } from '../../types/handoff';
import { SeverityBadge } from '../emergencies/SeverityBadge';
import { startHandoff, completeHandoff } from '../../services/handoffApi';
import { useToast } from '../common/Toast';
import { parseApiError } from '../../services/api';

interface HospitalHandoffCardProps {
  emergency: EmergencyCase;
  ambulance?: Ambulance | null;
  handoff?: Handoff | null;
  onRefresh: () => void;
}

export const HospitalHandoffCard: React.FC<HospitalHandoffCardProps> = ({
  emergency,
  ambulance,
  handoff,
  onRefresh,
}) => {
  const { addToast } = useToast();
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleStartHandoff = async () => {
    setStarting(true);
    setError(null);
    try {
      await startHandoff(emergency.id);
      addToast('info', 'Handoff Started', `Patient handoff initiated for Case #${emergency.case_number}`);
      onRefresh();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      addToast('error', 'Handoff Start Failed', parsed.message);
    } finally {
      setStarting(false);
    }
  };

  const handleCompleteHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivedBy.trim()) {
      setError('Please enter receiving staff / doctor name.');
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      await completeHandoff(emergency.id, {
        received_by: receivedBy.trim(),
        notes: notes.trim() || undefined,
      });
      addToast('success', 'Handoff Completed', `Emergency handoff completed. Ambulance released.`);
      onRefresh();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      addToast('error', 'Handoff Completion Failed', parsed.message);
    } finally {
      setCompleting(false);
    }
  };

  const currentHandoffStatus = handoff?.status || 'PENDING';

  return (
    <div className="p-6 rounded-3xl bg-amber-950/20 border-2 border-amber-500/50 shadow-2xl backdrop-blur-md space-y-4">
      <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6 text-amber-400 animate-bounce" />
          <h3 className="text-base font-black text-amber-200 tracking-wide">
            🚑 AMBULANCE ARRIVED AT HOSPITAL
          </h3>
        </div>
        <SeverityBadge severity={emergency.severity} />
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          {error}
        </div>
      )}

      {/* Ambulance & Case Info Box */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400">Emergency Case</span>
          <p className="font-mono font-bold text-slate-100 text-sm">{emergency.case_number}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400">Ambulance Unit</span>
          <p className="font-mono font-bold text-amber-400 text-sm">
            {ambulance?.vehicle_number || 'Assigned Ambulance'}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400">Patient Status</span>
          <p className="font-semibold text-rose-300">{emergency.severity} Priority</p>
        </div>
      </div>

      {/* Workflow Phase 1: START HANDOFF */}
      {currentHandoffStatus === 'PENDING' && (
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-300">
            Ambulance has arrived at triage. Click to initiate patient handoff procedures.
          </p>
          <button
            onClick={handleStartHandoff}
            disabled={starting}
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-extrabold text-xs text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-xl shadow-amber-400/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {starting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> Starting...
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4" /> [ START HANDOFF ]
              </>
            )}
          </button>
        </div>
      )}

      {/* Workflow Phase 2: COMPLETE HANDOFF FORM */}
      {currentHandoffStatus === 'IN_PROGRESS' && (
        <form onSubmit={handleCompleteHandoff} className="space-y-4 pt-2">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
            ● Handoff in progress. Record receiving clinician details below to complete transfer.
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Received By (Doctor / Staff Name) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Dr. Sarah Jenkins / Nurse Roberts"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Handoff Notes & Clinical Handover Observations
              </label>
              <textarea
                rows={2}
                placeholder="Enter triage notes, vital signs, or ICU bed assignment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-medium resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={completing}
            className="w-full py-3.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {completing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" /> Completing Handoff...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> [ COMPLETE HANDOFF ]
              </>
            )}
          </button>
        </form>
      )}

      {/* Workflow Phase 3: COMPLETED */}
      {currentHandoffStatus === 'COMPLETED' && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Patient Handoff Completed
          </div>
          <p className="text-[11px] text-slate-300">
            Received by: <strong className="text-white">{handoff?.received_by}</strong>
          </p>
          {handoff?.notes && (
            <p className="text-[11px] text-slate-400 italic">"{handoff.notes}"</p>
          )}
        </div>
      )}
    </div>
  );
};
