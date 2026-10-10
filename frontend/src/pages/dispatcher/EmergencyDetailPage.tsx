import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldAlert,
  MapPin,
  Award,
  Compass,
  Loader2,
  Truck,
  CheckCircle,
  Navigation,
  Bot,
} from 'lucide-react';
import { getEmergencyById, retryEmergencyAutomation } from '../../services/emergencyApi';
import { getRecommendations, createAllocationRequest, getEmergencyRequests } from '../../services/allocationApi';
import { getAmbulances, assignAmbulance, updateAmbulanceStatus } from '../../services/ambulanceApi';
import { getHospitals } from '../../services/hospitalApi';
import { getHandoff } from '../../services/handoffApi';
import { AmbulanceSimulationEngine, type AmbulanceSimulationSnapshot } from '../../services/ambulanceSimulation';
import { calculateHaversineDistanceKm, type RouteResult } from '../../services/routingService';
import type { EmergencyCase } from '../../types/emergency';
import type { Hospital } from '../../types/hospital';
import type { RecommendationResponse } from '../../types/allocation';
import type { AllocationRequest } from '../../types/reservation';
import type { Ambulance } from '../../types/ambulance';
import type { Handoff } from '../../types/handoff';
import { SeverityBadge } from '../../components/emergencies/SeverityBadge';
import { StatusBadge } from '../../components/emergencies/StatusBadge';
import { RecommendationCard } from '../../components/allocation/RecommendationCard';
import { IneligibleCard } from '../../components/allocation/IneligibleCard';
import { EmergencyTimeline } from '../../components/emergencies/EmergencyTimeline';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { useToast } from '../../components/common/Toast';
import { parseApiError } from '../../services/api';
import { wsService, WS_EVENTS } from '../../services/websocket';
import { PuneMap } from '../../components/map/PuneMap';
import type { EmergencyPoint } from '../../components/map/PuneMap';

export const EmergencyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const emergencyId = Number(id);
  const { addToast } = useToast();

  const [emergency, setEmergency] = useState<EmergencyCase | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [requests, setRequests] = useState<AllocationRequest[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [handoff, setHandoff] = useState<Handoff | null>(null);

  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<number | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const [simulationSnapshot, setSimulationSnapshot] = useState<AmbulanceSimulationSnapshot | null>(null);
  const simulationEngineRef = useRef<AmbulanceSimulationEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [submittingHospitalId, setSubmittingHospitalId] = useState<number | null>(null);
  const [assigningAmbulance, setAssigningAmbulance] = useState(false);
  const [updatingAmbulanceStatus, setUpdatingAmbulanceStatus] = useState(false);
  const [retryingAutomation, setRetryingAutomation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!emergencyId || isNaN(emergencyId)) return;
    try {
      const [eData, reqsData, ambData, hData] = await Promise.all([
        getEmergencyById(emergencyId),
        getEmergencyRequests(emergencyId),
        getAmbulances(),
        getHospitals(),
      ]);
      setEmergency(eData);
      setRequests(reqsData);
      setAmbulances(ambData);
      setHospitals(hData);

      // Check if accepted request exists, default selected hospital
      const accepted = reqsData.find((r) => r.status === 'ACCEPTED');
      if (accepted) {
        setSelectedHospitalId(accepted.hospital_id);
      }

      if (['ARRIVED', 'HANDOFF_COMPLETED'].includes(eData.status)) {
        try {
          const hDataHandoff = await getHandoff(emergencyId);
          setHandoff(hDataHandoff);
        } catch {
          setHandoff(null);
        }
      }
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [emergencyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket Live Subscriptions
  useEffect(() => {
    if (!emergencyId) return;

    const handleEvent = () => {
      fetchData();
    };

    wsService.subscribe(WS_EVENTS.ALLOCATION_REQUEST_ACCEPTED, handleEvent);
    wsService.subscribe(WS_EVENTS.AMBULANCE_ASSIGNED, handleEvent);
    wsService.subscribe(WS_EVENTS.AMBULANCE_STATUS_UPDATED, handleEvent);
    wsService.subscribe(WS_EVENTS.EMERGENCY_STATUS_UPDATED, handleEvent);
    wsService.subscribe(WS_EVENTS.AMBULANCE_ARRIVED, handleEvent);
    wsService.subscribe(WS_EVENTS.HANDOFF_STARTED, handleEvent);
    wsService.subscribe(WS_EVENTS.HANDOFF_COMPLETED, handleEvent);

    return () => {
      wsService.unsubscribe(WS_EVENTS.ALLOCATION_REQUEST_ACCEPTED, handleEvent);
      wsService.unsubscribe(WS_EVENTS.AMBULANCE_ASSIGNED, handleEvent);
      wsService.unsubscribe(WS_EVENTS.AMBULANCE_STATUS_UPDATED, handleEvent);
      wsService.unsubscribe(WS_EVENTS.EMERGENCY_STATUS_UPDATED, handleEvent);
      wsService.unsubscribe(WS_EVENTS.AMBULANCE_ARRIVED, handleEvent);
      wsService.unsubscribe(WS_EVENTS.HANDOFF_STARTED, handleEvent);
      wsService.unsubscribe(WS_EVENTS.HANDOFF_COMPLETED, handleEvent);
    };
  }, [emergencyId, fetchData]);

  const handleFetchRecommendations = async () => {
    if (!emergencyId) return;
    setRecommendationsLoading(true);
    setError(null);
    try {
      const recData = await getRecommendations(emergencyId);
      setRecommendations(recData);
      if (recData.recommendations.length > 0 && !selectedHospitalId) {
        setSelectedHospitalId(recData.recommendations[0].hospital_id);
      }
      addToast(
        'info',
        'Allocation Engine Executed',
        'Calculated hospital rankings for Pune hospitals based on resource match, travel time, and data freshness.'
      );
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
      setSelectedHospitalId(hospitalId);

      const hospitalName =
        recommendations?.recommendations.find((r) => r.hospital_id === hospitalId)?.hospital_name ||
        `Hospital #${hospitalId}`;

      addToast(
        'success',
        'Confirmation Request Sent',
        `Confirmation request sent to ${hospitalName}. Status set to PENDING.`
      );
      fetchData();
    } catch (err) {
      const parsed = parseApiError(err);
      addToast('error', 'Request Failed', parsed.message);
    } finally {
      setSubmittingHospitalId(null);
    }
  };

  const handleAssignAmbulance = async () => {
    if (!emergencyId || !selectedAmbulanceId) return;
    setAssigningAmbulance(true);
    try {
      await assignAmbulance(emergencyId, selectedAmbulanceId);
      addToast('success', 'Ambulance Assigned', `Ambulance assigned successfully! Status updated to EN ROUTE.`);
      setSelectedAmbulanceId(null);
      fetchData();
    } catch (err) {
      const parsed = parseApiError(err);
      addToast('error', 'Ambulance Assignment Failed', parsed.message);
    } finally {
      setAssigningAmbulance(false);
    }
  };

  const handleMarkArrived = async (ambulanceId: number) => {
    setUpdatingAmbulanceStatus(true);
    try {
      await updateAmbulanceStatus(ambulanceId, 'ARRIVED');
      addToast('info', 'Ambulance Arrived', 'Ambulance marked as ARRIVED at hospital.');
      fetchData();
    } catch (err) {
      const parsed = parseApiError(err);
      addToast('error', 'Status Update Failed', parsed.message);
    } finally {
      setUpdatingAmbulanceStatus(false);
    }
  };

  const handleRetryAutomation = async () => {
    if (!emergencyId) return;
    setRetryingAutomation(true);
    try {
      await retryEmergencyAutomation(emergencyId);
      addToast('info', 'Automation Retry Triggered', 'Automatic allocation workflow has been restarted.');
      fetchData();
    } catch (err) {
      const parsed = parseApiError(err);
      addToast('error', 'Automation Retry Failed', parsed.message);
    } finally {
      setRetryingAutomation(false);
    }
  };

  const formatDuration = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const assignedAmbulance = emergency?.assigned_ambulance_id
    ? ambulances.find((a) => a.id === emergency.assigned_ambulance_id)
    : null;
  const selectedHospital = hospitals.find((h) => h.id === selectedHospitalId) ?? null;

  useEffect(() => {
    if (!assignedAmbulance || !selectedHospital || !emergency) {
      setSimulationSnapshot(null);
      simulationEngineRef.current = null;
      return;
    }

    const routeCoordinates: [number, number][] =
      routeInfo && routeInfo.coordinates.length > 1
        ? routeInfo.coordinates.map(([lat, lon]) => [Number(lat), Number(lon)] as [number, number])
        : [
            [Number(emergency.pickup_latitude), Number(emergency.pickup_longitude)] as [number, number],
            [Number(selectedHospital.latitude), Number(selectedHospital.longitude)] as [number, number],
          ];

    const engine = new AmbulanceSimulationEngine({
      ambulanceId: assignedAmbulance.id,
      origin: [Number(emergency.pickup_latitude), Number(emergency.pickup_longitude)] as [number, number],
      destination: [Number(selectedHospital.latitude), Number(selectedHospital.longitude)] as [number, number],
      route: routeCoordinates,
      totalDistanceKm:
        routeInfo?.distanceKm ??
        calculateHaversineDistanceKm(
          Number(emergency.pickup_latitude),
          Number(emergency.pickup_longitude),
          Number(selectedHospital.latitude),
          Number(selectedHospital.longitude)
        ),
      totalEtaSeconds: Math.max(30, (routeInfo?.durationMinutes ?? 8) * 60),
      speedMultiplier: 10,
      updateIntervalMs: 200,
    });

    simulationEngineRef.current = engine;
    setSimulationSnapshot(engine.getSnapshot());
  }, [assignedAmbulance, selectedHospital, emergency, routeInfo]);

  useEffect(() => {
    const engine = simulationEngineRef.current;
    if (!engine || !engine.isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const current = engine.tick();
      setSimulationSnapshot(current);
    }, engine.updateInterval);

    return () => window.clearInterval(intervalId);
  }, [simulationSnapshot?.isRunning, assignedAmbulance?.id]);

  const handleStartAmbulanceSimulation = () => {
    const engine = simulationEngineRef.current;
    if (!engine) return;
    const updated = engine.start();
    setSimulationSnapshot(updated);
  };

  const handlePauseAmbulanceSimulation = () => {
    const engine = simulationEngineRef.current;
    if (!engine) return;
    const updated = engine.pause();
    setSimulationSnapshot(updated);
  };

  const handleResetAmbulanceSimulation = () => {
    const engine = simulationEngineRef.current;
    if (!engine) return;
    const updated = engine.reset();
    setSimulationSnapshot(updated);
  };

  if (loading) {
    return <LoadingSpinner label="Loading Emergency Case Details..." />;
  }

  if (!emergency) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-12">
        <ErrorAlert message={error || 'Emergency case not found.'} />
        <Link to="/dispatcher" className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
          <ArrowLeft className="w-4 h-4" /> Return to Command Center
        </Link>
      </div>
    );
  }

  const acceptedRequest = requests.find((r) => r.status === 'ACCEPTED');
  const availableAmbulances = ambulances.filter((a) => a.status === 'AVAILABLE');

  const simulationStatus = simulationSnapshot?.status ?? (assignedAmbulance?.status ?? 'IDLE');
  const simulationProgress = Math.round((simulationSnapshot?.progress ?? 0) * 100);
  const simulationEta = simulationSnapshot ? formatDuration(simulationSnapshot.etaSecondsRemaining) : '00:00';
  const simulationDistance = simulationSnapshot ? `${simulationSnapshot.distanceRemainingKm.toFixed(1)} km` : '0.0 km';

  const emergencyPoint: EmergencyPoint = {
    latitude: Number(emergency.pickup_latitude) || 18.5204,
    longitude: Number(emergency.pickup_longitude) || 73.841,
    label: `Incident ${emergency.case_number} (${emergency.severity})`,
    caseNumber: emergency.case_number,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Navigation & Header */}
      <div>
        <Link
          to="/dispatcher"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dispatcher Command Center
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl border border-red-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-800 font-mono tracking-tight">
                  {emergency.case_number}
                </h1>
                <SeverityBadge severity={emergency.severity} />
                <StatusBadge status={emergency.status} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Registered on {new Date(emergency.created_at).toLocaleString()} · Pune Operations
              </p>
            </div>
          </div>

          <button
            onClick={handleFetchRecommendations}
            disabled={recommendationsLoading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-teal-600 hover:bg-teal-700 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
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

          <button
            onClick={handleRetryAutomation}
            disabled={retryingAutomation}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
          >
            {retryingAutomation ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Retrying...
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" /> RETRY AUTOMATION
              </>
            )}
          </button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Visual Timeline Section */}
      <EmergencyTimeline status={emergency.status} handoffStatus={handoff?.status} />

      {/* Ambulance Dispatch & Transit Controller */}
      {(acceptedRequest ||
        ['HOSPITAL_SELECTED', 'EN_ROUTE', 'ARRIVED', 'HANDOFF_COMPLETED'].includes(emergency.status)) && (
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-500" /> Ambulance Dispatch & Transit Controller
            </h3>
            <span className="text-xs text-emerald-700 font-medium flex items-center gap-1 font-semibold">
              <CheckCircle className="w-3.5 h-3.5" /> Hospital Reserved
            </span>
          </div>

          {!assignedAmbulance ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Hospital confirmation received. Select an available Pune ambulance unit to assign to this incident.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <select
                  value={selectedAmbulanceId || ''}
                  onChange={(e) => setSelectedAmbulanceId(Number(e.target.value))}
                  className="flex-1 bg-white border border-slate-200 text-slate-800 text-xs rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                >
                  <option value="">-- Select Available Ambulance Unit --</option>
                  {availableAmbulances.map((amb) => (
                    <option key={amb.id} value={amb.id}>
                      {amb.vehicle_number} (AVAILABLE - Pune)
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleAssignAmbulance}
                  disabled={!selectedAmbulanceId || assigningAmbulance}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
                >
                  {assigningAmbulance ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Assigning...
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4" /> ASSIGN AMBULANCE
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-mono font-bold text-sm text-slate-800">
                  <Truck className="w-4 h-4 text-amber-500" /> AMBULANCE {assignedAmbulance.vehicle_number}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Unit Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      assignedAmbulance.status === 'EN_ROUTE'
                        ? 'bg-amber-100 text-amber-800'
                        : assignedAmbulance.status === 'ARRIVED'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    ● {assignedAmbulance.status}
                  </span>
                </div>
              </div>

              {assignedAmbulance.status === 'EN_ROUTE' && (
                <button
                  onClick={() => handleMarkArrived(assignedAmbulance.id)}
                  disabled={updatingAmbulanceStatus}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs text-white bg-amber-600 hover:bg-amber-700 shadow-sm cursor-pointer transition-all"
                >
                  {updatingAmbulanceStatus ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" /> [ MARK ARRIVED AT HOSPITAL ]
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {assignedAmbulance && selectedHospital && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Live Ambulance Simulation</p>
                  <h4 className="mt-1 text-lg font-bold text-slate-800">Ambulance {assignedAmbulance.vehicle_number}</h4>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-teal-50 text-teal-700 border-teal-200">
                  {simulationStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                  <div className="text-slate-400 uppercase tracking-wide text-[10px]">Status</div>
                  <div className="mt-1 font-bold text-slate-800">{simulationStatus}</div>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                  <div className="text-slate-400 uppercase tracking-wide text-[10px]">Destination</div>
                  <div className="mt-1 font-bold text-slate-800">{selectedHospital.name}</div>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                  <div className="text-slate-400 uppercase tracking-wide text-[10px]">ETA</div>
                  <div className="mt-1 font-bold text-slate-800">{simulationEta}</div>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                  <div className="text-slate-400 uppercase tracking-wide text-[10px]">Distance</div>
                  <div className="mt-1 font-bold text-slate-800">{simulationDistance}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <span>Progress</span>
                  <span>{simulationProgress}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, simulationProgress))}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={handleStartAmbulanceSimulation}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                >
                  ▶ Start Simulation
                </button>
                <button
                  onClick={handlePauseAmbulanceSimulation}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  ⏸ Pause
                </button>
                <button
                  onClick={handleResetAmbulanceSimulation}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  ↻ Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Incident Summary Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            Emergency Incident Details
          </h3>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Patient Age</span>
              <span className="font-bold text-slate-800 text-sm">
                {emergency.patient_age ? `${emergency.patient_age} Years` : 'Not Specified'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Pickup Coordinates</span>
              <span className="font-mono text-slate-800 text-sm flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                {emergency.pickup_latitude}, {emergency.pickup_longitude}
              </span>
            </div>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Incident Description</span>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
              {emergency.description || 'No additional description provided.'}
            </p>
          </div>
        </div>

        {/* Required Resources List */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            Required Resources ({emergency.requirements.length})
          </h3>

          <div className="space-y-2">
            {emergency.requirements.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
              >
                <div className="font-semibold text-slate-800">{req.resource_type}</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-teal-700">×{req.quantity}</span>
                  {req.required && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                      MANDATORY
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* REAL PUNE MAP INTEGRATION */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-bold text-slate-800">
              Real Pune Geographic Dispatch & Route Map
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Selected destination:{' '}
            <strong className="text-slate-700">
              {hospitals.find((h) => h.id === selectedHospitalId)?.name || 'None selected'}
            </strong>
          </span>
        </div>

        <PuneMap
          hospitals={hospitals}
          emergencyPoint={emergencyPoint}
          ambulances={ambulances}
          ambulanceSimulation={simulationSnapshot}
          selectedHospitalId={selectedHospitalId}
          onSelectHospital={(hId) => setSelectedHospitalId(hId)}
          onRouteInfoChange={setRouteInfo}
          recommendations={recommendations?.recommendations || []}
          height="460px"
        />
      </div>

      {/* Hospital Recommendations Section */}
      {recommendations && (
        <div className="space-y-6 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" /> Ranked Hospital Recommendations
            </h2>
            <span className="text-xs text-slate-500">
              Eligible: {recommendations.recommendations.length} | Ineligible: {recommendations.ineligible_hospitals.length}
            </span>
          </div>

          {recommendations.recommendations.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              ⚠️ No active Pune hospitals currently meet all mandatory resource requirements for this case.
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.recommendations.map((rec, idx) => {
                const isPending = requests.some(
                  (req) => req.hospital_id === rec.hospital_id && req.status === 'PENDING'
                );

                return (
                  <div key={rec.hospital_id} onClick={() => setSelectedHospitalId(rec.hospital_id)}>
                    <RecommendationCard
                      rank={idx + 1}
                      recommendation={rec}
                      isPending={isPending}
                      isSubmitting={submittingHospitalId === rec.hospital_id}
                      onRequestConfirmation={handleRequestConfirmation}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Ineligible Hospitals Section */}
          {recommendations.ineligible_hospitals.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
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
