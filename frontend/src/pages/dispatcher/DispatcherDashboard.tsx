import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Building2,
  Activity,
  Plus,
  Eye,
  Zap,
  Award,
  Compass,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Truck,
  RotateCcw,
} from 'lucide-react';
import { getEmergencies } from '../../services/emergencyApi';
import { getHospitals } from '../../services/hospitalApi';
import { getAmbulances } from '../../services/ambulanceApi';
import { getRecommendations, createAllocationRequest } from '../../services/allocationApi';
import type { EmergencyCase } from '../../types/emergency';
import type { Hospital } from '../../types/hospital';
import type { Ambulance } from '../../types/ambulance';
import type { RecommendationResponse } from '../../types/allocation';
import { SeverityBadge } from '../../components/emergencies/SeverityBadge';
import { StatusBadge } from '../../components/emergencies/StatusBadge';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { EmptyState } from '../../components/common/EmptyState';
import { parseApiError } from '../../services/api';
import { useToast } from '../../components/common/Toast';
import { useWebSocket } from '../../hooks/useWebSocket';
import { PuneMap } from '../../components/map/PuneMap';
import type { EmergencyPoint } from '../../components/map/PuneMap';

export const DispatcherDashboard: React.FC = () => {
  const [emergencies, setEmergencies] = useState<EmergencyCase[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Emergency & Geographic Location
  const [selectedEmergencyId, setSelectedEmergencyId] = useState<number | null>(null);
  const [emergencyPoint, setEmergencyPoint] = useState<EmergencyPoint>({
    latitude: 18.5204,
    longitude: 73.841,
    label: 'FC Road / Deccan Gymkhana, Pune',
  });

  // Allocation & Routing
  const [recommendationsData, setRecommendationsData] = useState<RecommendationResponse | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [submittingHospitalId, setSubmittingHospitalId] = useState<number | null>(null);

  const { addToast } = useToast();

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [eData, hData, aData] = await Promise.all([
        getEmergencies(),
        getHospitals(),
        getAmbulances(),
      ]);
      setEmergencies(eData);
      setHospitals(hData);
      setAmbulances(aData);

      // Auto-select first active emergency if none selected
      if (eData.length > 0 && selectedEmergencyId === null) {
        const first = eData[0];
        setSelectedEmergencyId(first.id);
        if (first.pickup_latitude && first.pickup_longitude) {
          setEmergencyPoint({
            latitude: Number(first.pickup_latitude),
            longitude: Number(first.pickup_longitude),
            label: `Case ${first.case_number} (${first.severity})`,
            caseNumber: first.case_number,
          });
        }
      }
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  // Run Allocation Recommendations when emergency is selected
  const fetchRankings = useCallback(async (eId: number) => {
    setRecommendationsLoading(true);
    try {
      const recs = await getRecommendations(eId);
      setRecommendationsData(recs);
      if (recs.recommendations.length > 0) {
        setSelectedHospitalId(recs.recommendations[0].hospital_id);
      }
    } catch (err) {
      console.warn('Could not auto-fetch recommendations:', err);
    } finally {
      setRecommendationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEmergencyId) {
      fetchRankings(selectedEmergencyId);
    }
  }, [selectedEmergencyId, fetchRankings]);

  // Handle switching emergency selection
  const handleSelectEmergency = (emergency: EmergencyCase) => {
    setSelectedEmergencyId(emergency.id);
    if (emergency.pickup_latitude && emergency.pickup_longitude) {
      setEmergencyPoint({
        latitude: Number(emergency.pickup_latitude),
        longitude: Number(emergency.pickup_longitude),
        label: `Case ${emergency.case_number} (${emergency.severity})`,
        caseNumber: emergency.case_number,
      });
    }
  };

  // Handle manual map click for emergency point
  const handleEmergencyPointChange = (point: EmergencyPoint) => {
    setEmergencyPoint(point);
    addToast('info', 'Incident Location Updated', `New coordinates: ${point.latitude}, ${point.longitude}`);
  };

  // Send hospital confirmation request
  const handleRequestConfirmation = async (hospitalId: number) => {
    if (!selectedEmergencyId) return;
    setSubmittingHospitalId(hospitalId);
    try {
      await createAllocationRequest(selectedEmergencyId, hospitalId);
      const hospitalName =
        hospitals.find((h) => h.id === hospitalId)?.name || `Hospital #${hospitalId}`;
      addToast(
        'success',
        'Confirmation Request Sent',
        `Allocation request sent to ${hospitalName}. Status set to PENDING.`
      );
      fetchData(false);
    } catch (err) {
      const parsed = parseApiError(err);
      addToast('error', 'Request Failed', parsed.message);
    } finally {
      setSubmittingHospitalId(null);
    }
  };

  // Listen to Real-Time WebSocket Events
  useWebSocket(
    [
      'RESOURCE_UPDATED',
      'ALLOCATION_REQUEST_ACCEPTED',
      'ALLOCATION_REQUEST_REJECTED',
      'EMERGENCY_STATUS_UPDATED',
      'AMBULANCE_STATUS_UPDATED',
      'AMBULANCE_ASSIGNED',
    ],
    (payload) => {
      if (payload.event === 'RESOURCE_UPDATED' && payload.data) {
        const { hospital_id, resource_id, resource_type, available, reserved, total } = payload.data;
        setHospitals((prev) =>
          prev.map((h) => {
            if (h.id === hospital_id && h.resources) {
              const updatedResources = h.resources.map((r) =>
                r.id === resource_id || r.resource_type === resource_type
                  ? { ...r, available, reserved, total }
                  : r
              );
              return { ...h, resources: updatedResources };
            }
            return h;
          })
        );
        addToast('info', 'Live Availability Updated', `Hospital #${hospital_id} ${resource_type}: ${available} available`);
      } else if (payload.event === 'ALLOCATION_REQUEST_ACCEPTED' && payload.data) {
        addToast(
          'success',
          'Hospital Accepted Request',
          `${payload.data.hospital_name || 'Hospital'} accepted emergency #${payload.data.emergency_id}`
        );
        fetchData(false);
      } else if (payload.event === 'ALLOCATION_REQUEST_REJECTED' && payload.data) {
        addToast(
          'warning',
          'Request Rejected',
          `Hospital #${payload.data.hospital_id} rejected allocation: ${payload.data.rejection_reason || 'No reason'}`
        );
        fetchData(false);
      } else if (payload.event === 'EMERGENCY_STATUS_UPDATED' && payload.data) {
        setEmergencies((prev) =>
          prev.map((e) => (e.id === payload.data.emergency_id ? { ...e, status: payload.data.status } : e))
        );
      }
    }
  );

  // Compute KPI Statistics
  const activeEmergencies = emergencies.filter(
    (e) => e.status !== 'HANDOFF_COMPLETED' && e.status !== 'CANCELLED'
  ).length;
  const availableHospitals = hospitals.filter((h) => h.status === 'Active').length;
  const totalIcuAvailable = hospitals.reduce((acc, h) => {
    const icu = h.resources?.find((r) => r.resource_type === 'ICU_BED');
    return acc + (icu?.available || 0);
  }, 0);
  const availableAmbulances = ambulances.filter((a) => a.status === 'AVAILABLE').length;

  const currentEmergencyObj = emergencies.find((e) => e.id === selectedEmergencyId);
  const selectedRecObj = recommendationsData?.recommendations.find(
    (r) => r.hospital_id === selectedHospitalId
  );

  if (loading) {
    return <LoadingSpinner label="Loading Pune Dispatcher Command Center..." />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Dispatcher Command Center
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              Pune Geographic Region
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time emergency incident monitoring, real Pune hospital map, and algorithmic resource allocation
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/dispatcher/simulation"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors"
          >
            <Zap className="w-4 h-4 text-teal-600" />
            <span>Simulation Lab</span>
          </Link>

          <Link
            to="/dispatcher/emergency/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Create Emergency
          </Link>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchData} />}

      {/* Top KPI Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-red-500">
            <span className="text-xs font-medium text-slate-500">Active Emergencies</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{activeEmergencies}</div>
          <p className="text-[11px] text-slate-400">Total in system: {emergencies.length}</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-blue-500">
            <span className="text-xs font-medium text-slate-500">Pune Hospitals Active</span>
            <Building2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {availableHospitals}{' '}
            <span className="text-xs text-slate-400 font-normal">/ {hospitals.length} total</span>
          </div>
          <p className="text-[11px] text-emerald-600 font-medium">8+ real Pune locations</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-teal-600">
            <span className="text-xs font-medium text-slate-500">Available ICU Beds</span>
            <Activity className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-teal-700">{totalIcuAvailable}</div>
          <p className="text-[11px] text-teal-600 font-medium">Simulated live capacity</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-medium text-slate-500">Ambulances Available</span>
            <Truck className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-amber-600">
            {availableAmbulances}{' '}
            <span className="text-xs text-slate-400 font-normal">/ {ambulances.length} units</span>
          </div>
          <p className="text-[11px] text-slate-400">Ready for dispatch in Pune</p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRIMARY GEOGRAPHIC VIEW: REAL PUNE MAP & ALLOCATION RANKINGS PANEL       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: REAL PUNE MAP */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-800">
                Primary Geographic Operations Map
              </h2>
            </div>

            {/* Active Emergency Case Selector Dropdown */}
            {emergencies.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Active Incident:</span>
                <select
                  value={selectedEmergencyId || ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const found = emergencies.find((em) => em.id === id);
                    if (found) handleSelectEmergency(found);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  {emergencies.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.case_number} ({em.severity}) - {em.patient_age ? `${em.patient_age}y` : 'Patient'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Interactive Pune Map */}
          <PuneMap
            hospitals={hospitals}
            emergencyPoint={emergencyPoint}
            onEmergencyPointChange={handleEmergencyPointChange}
            ambulances={ambulances}
            selectedHospitalId={selectedHospitalId}
            onSelectHospital={(hId) => setSelectedHospitalId(hId)}
            recommendations={recommendationsData?.recommendations || []}
            height="520px"
          />
        </div>

        {/* Right 4 Columns: ALLOCATION RANKING & "WHY THIS HOSPITAL?" DECISION PANEL */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-800">
                  Hospital Ranking & Allocation
                </h3>
              </div>
              {selectedEmergencyId && (
                <button
                  onClick={() => fetchRankings(selectedEmergencyId)}
                  disabled={recommendationsLoading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-slate-50 transition-colors"
                  title="Recalculate Ranking"
                >
                  <RotateCcw
                    className={`w-3.5 h-3.5 ${recommendationsLoading ? 'animate-spin' : ''}`}
                  />
                </button>
              )}
            </div>

            {/* Incident Summary Card */}
            {currentEmergencyObj ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800">
                    {currentEmergencyObj.case_number}
                  </span>
                  <SeverityBadge severity={currentEmergencyObj.severity} />
                </div>
                <p className="text-slate-600 text-[11px] line-clamp-2">
                  {currentEmergencyObj.description || 'Emergency incident in Pune region'}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {currentEmergencyObj.requirements.map((r, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-700"
                    >
                      {r.resource_type} ×{r.quantity}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-2">
                Select or create an incident to run allocation
              </div>
            )}

            {/* Recommendations List */}
            {recommendationsLoading ? (
              <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                Calculating deterministic ranking engine...
              </div>
            ) : recommendationsData && recommendationsData.recommendations.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Ranked Pune Hospitals
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {recommendationsData.recommendations.map((rec, idx) => {
                    const isSelected = selectedHospitalId === rec.hospital_id;
                    return (
                      <div
                        key={rec.hospital_id}
                        onClick={() => setSelectedHospitalId(rec.hospital_id)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-teal-50 border-teal-300 ring-1 ring-teal-200'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                idx === 0
                                  ? 'bg-teal-600 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <span className="font-semibold text-slate-800 truncate max-w-[170px]">
                              {rec.hospital_name}
                            </span>
                          </div>
                          <span className="font-bold text-teal-700">
                            {rec.final_score.toFixed(1)}
                            <span className="text-[10px] text-slate-400 font-normal">/100</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pl-7">
                          <span>{rec.estimated_travel_minutes} min ETA</span>
                          <span>{rec.distance_km} km</span>
                          <span className="text-emerald-700 font-medium">
                            {rec.resource_match_score.toFixed(0)}% Match
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* =================================================================== */}
                {/* "WHY THIS HOSPITAL?" DETERMINISTIC EXPLANATIONS SECTION           */}
                {/* =================================================================== */}
                {selectedRecObj && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Award className="w-4 h-4 text-amber-500" />
                      <span>Why this hospital?</span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 text-xs">
                      <div className="font-medium text-slate-700 pb-1 border-b border-slate-200/60 flex items-center justify-between">
                        <span>{selectedRecObj.hospital_name}</span>
                        <span className="text-teal-700 font-bold">
                          Score: {selectedRecObj.final_score.toFixed(1)}
                        </span>
                      </div>

                      <ul className="space-y-1.5 text-[11px] text-slate-600">
                        {selectedRecObj.reasons && selectedRecObj.reasons.length > 0 ? (
                          selectedRecObj.reasons.map((r, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                              <span>{r}</span>
                            </li>
                          ))
                        ) : (
                          <>
                            <li className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                              <span>Resource Match: {selectedRecObj.resource_match_score}% compatible</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                              <span>
                                Travel Time: {selectedRecObj.estimated_travel_minutes} mins ({selectedRecObj.distance_km} km)
                              </span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                              <span>Data Freshness: {selectedRecObj.freshness_status}</span>
                            </li>
                          </>
                        )}
                      </ul>
                    </div>

                    {/* Action: Send Allocation Confirmation */}
                    <button
                      onClick={() => handleRequestConfirmation(selectedRecObj.hospital_id)}
                      disabled={submittingHospitalId === selectedRecObj.hospital_id}
                      className="w-full mt-2 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-semibold text-xs text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {submittingHospitalId === selectedRecObj.hospital_id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending Request...</span>
                        </>
                      ) : (
                        <>
                          <span>Request Hospital Confirmation</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                Click an incident below or click on the map to trigger hospital ranking.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LOWER SECTION: ACTIVE INCIDENTS TABLE & PUNE HOSPITALS OVERVIEW           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Emergencies Table */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" /> Active Emergency Incidents
            </h2>
            <span className="text-xs text-slate-400">Total: {emergencies.length}</span>
          </div>

          {emergencies.length === 0 ? (
            <EmptyState
              title="No Active Emergencies"
              description="Click Create Emergency to register a new incident in Pune."
              action={
                <Link
                  to="/dispatcher/emergency/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-teal-600 text-white"
                >
                  <Plus className="w-4 h-4" /> Register Incident
                </Link>
              }
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Case #</th>
                      <th className="p-3.5">Severity</th>
                      <th className="p-3.5">Patient</th>
                      <th className="p-3.5">Requirements</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {emergencies.map((e) => {
                      const isCurrent = e.id === selectedEmergencyId;
                      return (
                        <tr
                          key={e.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isCurrent ? 'bg-teal-50/40' : ''
                          }`}
                        >
                          <td className="p-3.5 font-mono font-bold text-slate-800">
                            {e.case_number}
                          </td>
                          <td className="p-3.5">
                            <SeverityBadge severity={e.severity} />
                          </td>
                          <td className="p-3.5 font-medium text-slate-700">
                            {e.patient_age ? `${e.patient_age} yrs` : 'Unknown'}
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {e.requirements.map((r, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                                >
                                  {r.resource_type} ×{r.quantity}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <StatusBadge status={e.status} />
                          </td>
                          <td className="p-3.5 text-right space-x-2">
                            <button
                              onClick={() => handleSelectEmergency(e)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-teal-600 text-white'
                                  : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                              }`}
                            >
                              <Compass className="w-3 h-3" />
                              <span>{isCurrent ? 'Active on Map' : 'Select'}</span>
                            </button>
                            <Link
                              to={`/dispatcher/emergency/${e.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                            >
                              <Eye className="w-3 h-3" /> View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Participating Pune Hospitals Overview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" /> Participating Pune Hospitals
            </h2>
            <span className="text-xs text-slate-400">Total: {hospitals.length}</span>
          </div>

          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {hospitals.map((h) => {
              const icu = h.resources?.find((r) => r.resource_type === 'ICU_BED');
              const vent = h.resources?.find((r) => r.resource_type === 'VENTILATOR');
              const isSelected = selectedHospitalId === h.id;

              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedHospitalId(h.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-teal-50 border-teal-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h4 className="font-bold text-slate-800 text-xs truncate">{h.name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        h.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : h.status === 'Busy'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {h.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 truncate mb-2">
                    {h.address || 'Pune, Maharashtra'}
                  </p>

                  <div className="grid grid-cols-2 gap-1.5 text-center text-xs">
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">ICU Beds</span>
                      <span className="font-bold text-teal-700">{icu?.available || 0}</span>
                      <span className="text-[10px] text-slate-400">/{icu?.total || 0}</span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Ventilators</span>
                      <span className="font-bold text-teal-700">{vent?.available || 0}</span>
                      <span className="text-[10px] text-slate-400">/{vent?.total || 0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
