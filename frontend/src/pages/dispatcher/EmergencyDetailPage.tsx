import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, MapPin, Award, Compass, Loader2 } from 'lucide-react';
import { getEmergencyById } from '../../services/emergencyApi';
import { getRecommendations, createAllocationRequest, getEmergencyRequests } from '../../services/allocationApi';
import type { EmergencyCase } from '../../types/emergency';
import type { RecommendationResponse } from '../../types/allocation';
import type { AllocationRequest } from '../../types/reservation';
import { SeverityBadge } from '../../components/emergencies/SeverityBadge';
import { StatusBadge } from '../../components/emergencies/StatusBadge';
import { RecommendationCard } from '../../components/allocation/RecommendationCard';
import { IneligibleCard } from '../../components/allocation/IneligibleCard';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { useToast } from '../../components/common/Toast';
import { parseApiError } from '../../services/api';

export const EmergencyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const emergencyId = Number(id);
  const { addToast } = useToast();

  const [emergency, setEmergency] = useState<EmergencyCase | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [requests, setRequests] = useState<AllocationRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [submittingHospitalId, setSubmittingHospitalId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!emergencyId || isNaN(emergencyId)) return;
    setLoading(true);
    setError(null);
    try {
      const [eData, reqsData] = await Promise.all([
        getEmergencyById(emergencyId),
        getEmergencyRequests(emergencyId),
      ]);
      setEmergency(eData);
      setRequests(reqsData);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [emergencyId]);

  const handleFetchRecommendations = async () => {
    if (!emergencyId) return;
    setRecommendationsLoading(true);
    setError(null);
    try {
      const recData = await getRecommendations(emergencyId);
      setRecommendations(recData);
      addToast('info', 'Allocation Engine Executed', 'Calculated hospital rankings based on resource match, travel time, and data freshness.');
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      addToast('error', 'Recommendation Engine Failed', parsed.message);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const handleRequestConfirmation = async (hospitalId: number) => {
    if (!emergencyId) return;
    setSubmittingHospitalId(hospitalId);
    try {
      const createdReq = await createAllocationRequest(emergencyId, hospitalId);
      setRequests((prev) => [...prev, createdReq]);

      const hospitalName =
        recommendations?.recommendations.find((r) => r.hospital_id === hospitalId)?.hospital_name ||
        `Hospital #${hospitalId}`;

      addToast('success', 'Confirmation Request Sent', `Confirmation request sent to ${hospitalName}. Status set to PENDING.`);
      
      // Refresh emergency details to update status
      fetchData();
    } catch (err) {
      const parsed = parseApiError(err);
      addToast('error', 'Request Failed', parsed.message);
    } finally {
      setSubmittingHospitalId(null);
    }
  };

  if (loading) {
    return <LoadingSpinner label="Loading Emergency Case Details..." />;
  }

  if (!emergency) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-12">
        <ErrorAlert message={error || 'Emergency case not found.'} />
        <Link to="/dispatcher" className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400">
          <ArrowLeft className="w-4 h-4" /> Return to Command Center
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Navigation & Header */}
      <div>
        <Link
          to="/dispatcher"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dispatcher Command Center
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-white font-mono tracking-tight">
                  {emergency.case_number}
                </h1>
                <SeverityBadge severity={emergency.severity} />
                <StatusBadge status={emergency.status} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Registered on {new Date(emergency.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <button
            onClick={handleFetchRecommendations}
            disabled={recommendationsLoading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-xl shadow-rose-600/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {recommendationsLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Calculating Rankings...
              </>
            ) : (
              <>
                <Compass className="w-4 h-4" /> FIND RECOMMENDED HOSPITALS
              </>
            )}
          </button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Incident Summary Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl backdrop-blur-md">
          <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400 border-b border-slate-800/80 pb-2">
            Emergency Incident Details
          </h3>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Patient Age</span>
              <span className="font-bold text-slate-200 text-sm">
                {emergency.patient_age ? `${emergency.patient_age} Years` : 'Not Specified'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Pickup Coordinates</span>
              <span className="font-mono text-slate-200 text-sm flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                {emergency.pickup_latitude}, {emergency.pickup_longitude}
              </span>
            </div>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Incident Description</span>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              {emergency.description || 'No additional description provided.'}
            </p>
          </div>
        </div>

        {/* Required Resources List */}
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl backdrop-blur-md">
          <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400 border-b border-slate-800/80 pb-2">
            Required Resources ({emergency.requirements.length})
          </h3>

          <div className="space-y-2.5">
            {emergency.requirements.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs"
              >
                <div className="font-semibold text-slate-200">{req.resource_type}</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-400">×{req.quantity}</span>
                  {req.required && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      MANDATORY
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hospital Recommendations Section */}
      {recommendations && (
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Award className="w-6 h-6 text-amber-400" /> Ranked Hospital Recommendations
            </h2>
            <span className="text-xs text-slate-400">
              Eligible: {recommendations.recommendations.length} | Ineligible: {recommendations.ineligible_hospitals.length}
            </span>
          </div>

          {recommendations.recommendations.length === 0 ? (
            <div className="p-6 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs">
              ⚠️ No active hospitals currently meet all mandatory resource requirements for this emergency case.
            </div>
          ) : (
            <div className="space-y-6">
              {recommendations.recommendations.map((rec, idx) => {
                const isPending = requests.some(
                  (req) => req.hospital_id === rec.hospital_id && req.status === 'PENDING'
                );

                return (
                  <RecommendationCard
                    key={rec.hospital_id}
                    rank={idx + 1}
                    recommendation={rec}
                    isPending={isPending}
                    isSubmitting={submittingHospitalId === rec.hospital_id}
                    onRequestConfirmation={handleRequestConfirmation}
                  />
                );
              })}
            </div>
          )}

          {/* Ineligible Hospitals Section */}
          {recommendations.ineligible_hospitals.length > 0 && (
            <div className="space-y-3 pt-6 border-t border-slate-800">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Incompatible Hospitals ({recommendations.ineligible_hospitals.length})
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.ineligible_hospitals.map((ineligibleRec) => (
                  <IneligibleCard key={ineligibleRec.hospital_id} recommendation={ineligibleRec} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
