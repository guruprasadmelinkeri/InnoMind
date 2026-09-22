import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { AllocationRequest } from '../../types/reservation';
import type { EmergencyCase } from '../../types/emergency';
import { getEmergencies } from '../../services/emergencyApi';
import { getEmergencyRequests } from '../../services/allocationApi';
import { acceptAllocationRequest, rejectAllocationRequest } from '../../services/reservationApi';
import { getHospitalById } from '../../services/hospitalApi';
import type { Hospital } from '../../types/hospital';
import { SeverityBadge } from '../../components/emergencies/SeverityBadge';
import { StatusBadge } from '../../components/emergencies/StatusBadge';
import { RejectModal } from '../../components/hospitals/RejectModal';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { parseApiError } from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  Inbox,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  RefreshCw,
  AlertTriangle,
  FileText,
  User,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

interface CombinedRequestItem {
  request: AllocationRequest;
  emergency: EmergencyCase;
}

export const HospitalRequestsPage: React.FC = () => {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const id = Number(hospitalId);
  const { addToast } = useToast();

  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [items, setItems] = useState<CombinedRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Accept loading state with immediate verification message
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  // Reject Modal state
  const [rejectingRequest, setRejectingRequest] = useState<AllocationRequest | null>(null);

  // 409 Conflict Error Modal state
  const [conflictError, setConflictError] = useState<{ title: string; message: string } | null>(null);

  const fetchRequests = useCallback(async (showRefreshing = false) => {
    if (!id || isNaN(id)) {
      setError('Invalid Hospital ID');
      setLoading(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const [hData, emergencies] = await Promise.all([
        getHospitalById(id),
        getEmergencies(),
      ]);
      setHospital(hData);

      // Fetch requests for all emergencies and filter for this hospital
      const combined: CombinedRequestItem[] = [];
      const requestsPromises = emergencies.map(async (emergency) => {
        try {
          const reqs = await getEmergencyRequests(emergency.id);
          const hospitalReqs = reqs.filter((r) => r.hospital_id === id);
          return hospitalReqs.map((r) => ({ request: r, emergency }));
        } catch {
          return [];
        }
      });

      const results = await Promise.all(requestsPromises);
      results.forEach((list) => combined.push(...list));

      // Sort newest requests first
      combined.sort((a, b) => new Date(b.request.requested_at).getTime() - new Date(a.request.requested_at).getTime());

      setItems(combined);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load hospital allocation requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-Time WebSocket Listener
  useWebSocket(
    [
      'ALLOCATION_REQUEST_CREATED',
      'ALLOCATION_REQUEST_ACCEPTED',
      'ALLOCATION_REQUEST_REJECTED',
    ],
    (payload) => {
      if (payload.data && payload.data.hospital_id === id) {
        if (payload.event === 'ALLOCATION_REQUEST_CREATED') {
          addToast(
            'info',
            'NEW EMERGENCY REQUEST',
            `Received allocation request for Case #${payload.data.case_number || payload.data.emergency_id}`
          );
        }
        fetchRequests(false);
      }
    }
  );

  const handleAccept = async (request: AllocationRequest) => {
    setAcceptingId(request.id);
    try {
      const result = await acceptAllocationRequest(request.id);
      addToast(
        'success',
        `Request accepted! Resources reserved for ${result.hospital_name || 'Hospital'}.`
      );
      await fetchRequests(true);
    } catch (err: any) {
      const parsed = parseApiError(err);
      if (parsed.isConflict) {
        setConflictError({
          title: 'Resource Allocation Conflict (409)',
          message: parsed.message || 'Resource capacity is no longer available or case was already assigned.',
        });
      } else {
        addToast('error', parsed.message);
      }
    } finally {
      setAcceptingId(null);
    }
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectingRequest) return;
    try {
      await rejectAllocationRequest(rejectingRequest.id, reason);
      addToast('info', 'Allocation request rejected.');
      await fetchRequests(true);
    } catch (err: any) {
      const parsed = parseApiError(err);
      addToast('error', parsed.message);
    } finally {
      setRejectingRequest(null);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <LoadingSpinner label="Checking hospital allocation requests..." size="lg" />
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <ErrorAlert message={error || 'Hospital not found'} onRetry={() => fetchRequests()} />
      </div>
    );
  }

  const filteredItems = items.filter((item) => {
    if (filterStatus === 'ALL') return true;
    return item.request.status === filterStatus;
  });

  const pendingCount = items.filter((i) => i.request.status === 'PENDING').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-100 flex items-center gap-3">
              <Inbox className="w-7 h-7 text-emerald-400" /> Allocation Requests
            </h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse">
                {pendingCount} PENDING
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Emergency case dispatch requests submitted to <strong className="text-slate-200">{hospital.name}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchRequests(true)}
            disabled={refreshing}
            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
          <Link
            to={`/hospital/${hospital.id}`}
            className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-2 transition-all"
          >
            <Building2 className="w-4 h-4 text-emerald-400" /> View Capacity Dashboard
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        {['ALL', 'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filterStatus === st
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            {st} {st === 'PENDING' && pendingCount > 0 ? `(${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {filteredItems.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-3">
          <Inbox className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No Allocation Requests Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterStatus === 'ALL'
              ? 'There are currently no emergency allocation requests targeting this hospital.'
              : `No requests with status '${filterStatus}'.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map(({ request, emergency }) => {
            const isAcceptingThis = acceptingId === request.id;

            return (
              <div
                key={request.id}
                className={`p-6 rounded-2xl border transition-all space-y-5 ${
                  request.status === 'PENDING'
                    ? 'bg-slate-900/90 border-emerald-500/40 shadow-xl shadow-emerald-500/5'
                    : request.status === 'ACCEPTED'
                    ? 'bg-emerald-950/20 border-emerald-800/40'
                    : 'bg-slate-900/50 border-slate-800/80 opacity-80'
                }`}
              >
                {/* Request Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-mono font-black text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                      REQ #{request.id}
                    </span>
                    <SeverityBadge severity={emergency.severity} />
                    <StatusBadge status={emergency.status} />
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        request.status === 'PENDING'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : request.status === 'ACCEPTED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" /> Requested:{' '}
                      {new Date(request.requested_at).toLocaleTimeString()}
                    </span>
                    {request.expires_at && request.status === 'PENDING' && (
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        Expires: {new Date(request.expires_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Emergency Case Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Case Identifier</span>
                    <p className="text-sm font-black text-slate-100 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" /> {emergency.case_number}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Patient Demographic</span>
                    <p className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <User className="w-4 h-4 text-sky-400" /> Age: {emergency.patient_age} yrs
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Matching Recommendation Score</span>
                    <p className="text-sm font-black text-emerald-400">
                      {Math.round(request.match_score * 100)}% Match Score
                    </p>
                  </div>
                </div>

                {emergency.description && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300">
                    <strong className="text-slate-400">Clinical Summary: </strong>
                    {emergency.description}
                  </div>
                )}

                {/* Required Resources Badge List */}
                <div className="space-y-2">
                  <span className="text-[11px] uppercase font-bold text-slate-400">Required Resources to Reserve</span>
                  <div className="flex flex-wrap gap-2">
                    {emergency.requirements.map((req) => (
                      <span
                        key={req.id}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        {req.resource_type}: <strong className="text-emerald-400">{req.quantity}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Rejection Reason if present */}
                {request.rejection_reason && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <strong>Rejection Reason: </strong>
                      {request.rejection_reason}
                    </div>
                  </div>
                )}

                {/* Action Footer for PENDING requests */}
                {request.status === 'PENDING' && (
                  <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-slate-400">
                      Accepting will atomically lock and reserve all required resources.
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        onClick={() => setRejectingRequest(request)}
                        disabled={isAcceptingThis}
                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" /> Reject Request
                      </button>

                      <button
                        onClick={() => handleAccept(request)}
                        disabled={isAcceptingThis}
                        className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isAcceptingThis ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                            Checking current resource availability...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> ACCEPT & RESERVE
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Link to Dispatcher View */}
                <div className="flex items-center justify-end text-[11px] text-slate-500 pt-1">
                  <Link
                    to={`/dispatcher/emergency/${emergency.id}`}
                    className="hover:text-emerald-400 transition-colors flex items-center gap-1"
                  >
                    View Emergency Detail Page <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingRequest && (
        <RejectModal
          isOpen={Boolean(rejectingRequest)}
          onClose={() => setRejectingRequest(null)}
          onConfirmReject={handleConfirmReject}
        />
      )}

      {/* HTTP 409 Conflict Error Modal */}
      {conflictError && (
        <Modal
          isOpen={Boolean(conflictError)}
          onClose={() => setConflictError(null)}
          title={conflictError.title}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              <ShieldAlert className="w-6 h-6 shrink-0 text-rose-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-slate-100">Atomic Reservation Failed</p>
                <p>{conflictError.message}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              The request could not be fulfilled. Another dispatcher or hospital may have allocated the required resources or the request has expired.
            </p>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setConflictError(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
