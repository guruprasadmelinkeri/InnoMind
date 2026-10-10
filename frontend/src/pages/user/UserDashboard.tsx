import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useToast } from '../../components/common/Toast';
import { PUNE_PRESETS, PuneMap, type EmergencyPoint } from '../../components/map/PuneMap';
import { StatusBadge } from '../../components/emergencies/StatusBadge';
import { useWebSocket } from '../../hooks/useWebSocket';
import { parseApiError } from '../../services/api';
import { createEmergency, getEmergencies } from '../../services/emergencyApi';
import { getRecommendations } from '../../services/allocationApi';
import { getHospitals } from '../../services/hospitalApi';
import { AmbulanceSimulationEngine, type AmbulanceSimulationSnapshot } from '../../services/ambulanceSimulation';
import { calculateHaversineDistanceKm, type RouteResult } from '../../services/routingService';
import type { RecommendationResponse } from '../../types/allocation';
import type { Ambulance } from '../../types/ambulance';
import type { EmergencyCase, EmergencyCaseCreate, EmergencyRequirementCreate, EmergencySeverity } from '../../types/emergency';
import type { Hospital, ResourceType } from '../../types/hospital';
import { analyzeEmergencyDescription } from '../../services/aiApi';
import type { EmergencyAnalyzeResponse } from '../../services/aiApi';

const RESOURCE_TYPES: { type: ResourceType; label: string }[] = [
  { type: 'ICU_BED', label: 'ICU Bed' },
  { type: 'GENERAL_BED', label: 'General Bed' },
  { type: 'VENTILATOR', label: 'Ventilator' },
  { type: 'OXYGEN_BED', label: 'Oxygen Bed' },
  { type: 'TRAUMA_BED', label: 'Trauma Bed' },
  { type: 'OPERATING_ROOM', label: 'Operating Room' },
];

const DEMO_EMERGENCY_TEXT =
  '62 year old male involved in a highway accident near FC Road, Deccan Gymkhana, Pune. Severe bleeding, difficulty breathing and suspected chest trauma.';

const USER_STATUS_COPY: Record<string, string> = {
  CREATED: 'Request received and queued for triage.',
  SEARCHING: 'Emergency desk is matching you with the nearest suitable hospital.',
  HOSPITAL_SELECTED: 'A hospital has accepted the case and is preparing for handoff.',
  EN_ROUTE: 'Ambulance is on the way to your location.',
  ARRIVED: 'Ambulance has reached the hospital and care is being transferred.',
  HANDOFF_COMPLETED: 'Patient handoff has been completed successfully.',
  CANCELLED: 'This request has been cancelled and closed.',
};

const STATUS_SEQUENCE = [
  'CREATED',
  'SEARCHING',
  'HOSPITAL_SELECTED',
  'EN_ROUTE',
  'ARRIVED',
  'HANDOFF_COMPLETED',
] as const;

const getWorkflowProgress = (status: string): number => {
  if (status === 'CANCELLED') return 0;
  const index = STATUS_SEQUENCE.indexOf(status as (typeof STATUS_SEQUENCE)[number]);
  if (index === -1) return 0;
  return ((index + 1) / STATUS_SEQUENCE.length) * 100;
};

export const UserDashboard: React.FC = () => {
  const { addToast } = useToast();

  const [aiInput, setAiInput] = useState<string>('');
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<EmergencyAnalyzeResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [severity, setSeverity] = useState<EmergencySeverity>('CRITICAL');
  const [patientAge, setPatientAge] = useState<string>('45');
  const [description, setDescription] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('18.520400');
  const [longitude, setLongitude] = useState<string>('73.841000');
  const [requirements, setRequirements] = useState<EmergencyRequirementCreate[]>([
    { resource_type: 'ICU_BED', quantity: 1, required: true },
    { resource_type: 'VENTILATOR', quantity: 1, required: true },
    { resource_type: 'TRAUMA_BED', quantity: 1, required: true },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEmergency, setActiveEmergency] = useState<EmergencyCase | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [liveRouteInfo, setLiveRouteInfo] = useState<RouteResult | null>(null);
  const [userSimulation, setUserSimulation] = useState<AmbulanceSimulationSnapshot | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const userSimulationRef = useRef<AmbulanceSimulationEngine | null>(null);

  const loadRecommendations = useCallback(async (emergencyId: number) => {
    try {
      const response = await getRecommendations(emergencyId);
      setRecommendations(response);
    } catch (err) {
      console.warn('Could not fetch latest recommendations for user dashboard:', err);
    }
  }, []);

  useEffect(() => {
    if (!miniMapRef.current) return;

    const latNum = parseFloat(latitude) || 18.5204;
    const lonNum = parseFloat(longitude) || 73.841;

    if (!miniMapInstance.current) {
      const map = L.map(miniMapRef.current, {
        center: [latNum, lonNum],
        zoom: 13,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const marker = L.marker([latNum, lonNum], { draggable: true }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setLatitude(pos.lat.toFixed(6));
        setLongitude(pos.lng.toFixed(6));
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        setLatitude(e.latlng.lat.toFixed(6));
        setLongitude(e.latlng.lng.toFixed(6));
      });

      markerRef.current = marker;
      miniMapInstance.current = map;
    } else {
      if (markerRef.current) {
        markerRef.current.setLatLng([latNum, lonNum]);
      }
      miniMapInstance.current.setView([latNum, lonNum], miniMapInstance.current.getZoom());
    }
  }, [latitude, longitude]);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const [emergencyList, hospitalList] = await Promise.all([getEmergencies(), getHospitals()]);
        setHospitals(hospitalList);

        const sorted = [...emergencyList].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latest = sorted[0] || null;
        setActiveEmergency(latest);
        if (latest) {
          await loadRecommendations(latest.id);
        }
      } catch (err) {
        console.warn('Unable to load recent emergency request:', err);
      } finally {
        setLoadingRecent(false);
      }
    };

    void fetchRecent();
  }, [loadRecommendations]);

  useWebSocket(['EMERGENCY_STATUS_UPDATED', 'AUTOMATION_INTERVENTION_REQUIRED'], (payload) => {
    if (!payload.data) return;

    if (payload.event === 'AUTOMATION_INTERVENTION_REQUIRED') {
      if (!activeEmergency || Number(payload.data.emergency_id) !== activeEmergency.id) {
        return;
      }
      addToast(
        'warning',
        'Dispatcher Reviewing Your Case',
        payload.data.message || 'Your request needs manual coordination. The dispatch team has been notified.'
      );
      return;
    }

    const emergencyId = Number(payload.data.emergency_id);
    if (!activeEmergency || emergencyId !== activeEmergency.id) {
      return;
    }

    setActiveEmergency((prev) => (prev ? { ...prev, status: payload.data.status } : prev));
    void loadRecommendations(emergencyId);
  });

  const topRecommendation = useMemo(
    () => recommendations?.recommendations[0] ?? null,
    [recommendations]
  );

  const selectedHospital = useMemo(
    () => hospitals.find((hospital) => hospital.id === topRecommendation?.hospital_id) ?? null,
    [hospitals, topRecommendation]
  );

  const liveEmergencyPoint = useMemo<EmergencyPoint | null>(() => {
    if (!activeEmergency) return null;
    const lat = Number(activeEmergency.pickup_latitude);
    const lon = Number(activeEmergency.pickup_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      latitude: lat,
      longitude: lon,
      label: `${activeEmergency.case_number} · ${activeEmergency.severity}`,
      caseNumber: activeEmergency.case_number,
    };
  }, [activeEmergency]);

  const workflowProgress = activeEmergency ? getWorkflowProgress(activeEmergency.status) : 0;
  const workflowIndex = activeEmergency ? STATUS_SEQUENCE.indexOf(activeEmergency.status as (typeof STATUS_SEQUENCE)[number]) : -1;

  const formatDuration = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!activeEmergency || !selectedHospital) {
      userSimulationRef.current = null;
      setUserSimulation(null);
      return;
    }

    const origin: [number, number] = [Number(activeEmergency.pickup_latitude), Number(activeEmergency.pickup_longitude)];
    const destination: [number, number] = [Number(selectedHospital.latitude), Number(selectedHospital.longitude)];

    if (!origin[0] || !origin[1] || !destination[0] || !destination[1]) {
      userSimulationRef.current = null;
      setUserSimulation(null);
      return;
    }

    const routeCoordinates: [number, number][] =
      liveRouteInfo && liveRouteInfo.coordinates.length > 1
        ? liveRouteInfo.coordinates.map(([lat, lon]) => [Number(lat), Number(lon)] as [number, number])
        : [origin, destination];

    const engine = new AmbulanceSimulationEngine({
      ambulanceId: 99999,
      origin,
      destination,
      route: routeCoordinates,
      totalDistanceKm:
        liveRouteInfo?.distanceKm ??
        calculateHaversineDistanceKm(
          Number(activeEmergency.pickup_latitude),
          Number(activeEmergency.pickup_longitude),
          Number(selectedHospital.latitude),
          Number(selectedHospital.longitude)
        ),
      totalEtaSeconds: Math.max(30, (liveRouteInfo?.durationMinutes ?? 9) * 60),
      speedMultiplier: 12,
      updateIntervalMs: 220,
    });

    userSimulationRef.current = engine;
    const shouldRun = ['HOSPITAL_SELECTED', 'EN_ROUTE', 'ARRIVED', 'HANDOFF_COMPLETED'].includes(activeEmergency.status);
    if (shouldRun) {
      const startedSnapshot = engine.start();
      setUserSimulation(startedSnapshot);
    } else {
      const resetSnapshot = engine.reset();
      setUserSimulation(resetSnapshot);
    }
  }, [activeEmergency, selectedHospital, liveRouteInfo]);

  useEffect(() => {
    const engine = userSimulationRef.current;
    if (!engine || !activeEmergency) return;

    const shouldRun = ['HOSPITAL_SELECTED', 'EN_ROUTE', 'ARRIVED', 'HANDOFF_COMPLETED'].includes(activeEmergency.status);
    if (!shouldRun) return;

    const intervalId = window.setInterval(() => {
      const next = engine.tick();
      setUserSimulation(next);
    }, engine.updateInterval);

    return () => window.clearInterval(intervalId);
  }, [activeEmergency?.status]);

  const liveAmbulance = useMemo<Ambulance[]>(() => {
    if (!userSimulation || !selectedHospital) return [];

    const status: Ambulance['status'] =
      userSimulation.status === 'IDLE' ? 'AVAILABLE' : userSimulation.status === 'ARRIVED' ? 'ARRIVED' : 'EN_ROUTE';

    return [
      {
        id: userSimulation.ambulanceId,
        vehicle_number: 'MediRoute-01',
        status,
        current_latitude: userSimulation.currentLatitude,
        current_longitude: userSimulation.currentLongitude,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }, [selectedHospital, userSimulation]);

  const handleUseDemoText = () => {
    setAiInput(DEMO_EMERGENCY_TEXT);
  };

  const handleAnalyzeWithGemini = async () => {
    if (!aiInput.trim()) {
      setAiError('Please enter an emergency description to analyze.');
      return;
    }

    setAiAnalyzing(true);
    setAiError(null);
    setAiAnalysis(null);

    try {
      const result = await analyzeEmergencyDescription(aiInput.trim());
      setAiAnalysis(result);
      addToast('success', 'Gemini Analysis Complete', 'Successfully extracted clinical parameters and requirements.');
    } catch (err) {
      const parsed = parseApiError(err);
      const errMsg = parsed.message || 'Unable to analyze emergency. Please enter requirements manually.';
      setAiError(errMsg);
      addToast('error', 'AI Analysis Failed', errMsg);
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleApplyAnalysis = () => {
    if (!aiAnalysis) return;

    setSeverity(aiAnalysis.severity);
    if (aiAnalysis.patient_age !== undefined && aiAnalysis.patient_age !== null) {
      setPatientAge(String(aiAnalysis.patient_age));
    }
    setDescription(aiAnalysis.summary || aiInput);

    if (aiAnalysis.required_resources.length > 0) {
      setRequirements(
        aiAnalysis.required_resources.map((r) => ({
          resource_type: r.resource_type,
          quantity: r.quantity,
          required: true,
        }))
      );
    }

    addToast('info', 'Analysis Applied', 'Populated incident form with Gemini AI recommendations.');
  };

  const handleAddRequirement = () => {
    const selectedTypes = new Set(requirements.map((r) => r.resource_type));
    const nextType = RESOURCE_TYPES.find((rt) => !selectedTypes.has(rt.type));

    if (!nextType) {
      addToast('warning', 'All Resource Types Added', 'All available resource types are already included in requirements.');
      return;
    }

    setRequirements((prev) => [...prev, { resource_type: nextType.type, quantity: 1, required: true }]);
  };

  const handleRemoveRequirement = (index: number) => {
    if (requirements.length <= 1) {
      addToast('warning', 'Requirement Required', 'An emergency must have at least one resource requirement.');
      return;
    }

    setRequirements((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRequirementChange = (
    index: number,
    field: keyof EmergencyRequirementCreate,
    value: any
  ) => {
    setRequirements((prev) =>
      prev.map((req, i) => (i === index ? { ...req, [field]: value } : req))
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const latNum = parseFloat(latitude);
    const lonNum = parseFloat(longitude);
    const ageNum = patientAge ? parseInt(patientAge, 10) : undefined;

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError('Pickup latitude must be a valid number between -90 and 90.');
      return;
    }

    if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      setError('Pickup longitude must be a valid number between -180 and 180.');
      return;
    }

    if (ageNum !== undefined && (isNaN(ageNum) || ageNum < 0 || ageNum > 120)) {
      setError('Patient age must be between 0 and 120 years.');
      return;
    }

    if (!description.trim()) {
      setError('Please describe the emergency so dispatch can assess the situation.');
      return;
    }

    if (requirements.length === 0) {
      setError('At least one resource requirement is required.');
      return;
    }

    for (const req of requirements) {
      if (req.quantity <= 0) {
        setError(`Quantity for ${req.resource_type} must be greater than 0.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const createdCase = await createEmergency({
        severity,
        patient_age: ageNum,
        description: description.trim(),
        pickup_latitude: latNum,
        pickup_longitude: lonNum,
        requirements,
      } as EmergencyCaseCreate);

      setActiveEmergency(createdCase);
      await loadRecommendations(createdCase.id);
      addToast('success', 'Emergency Request Sent', `Case ${createdCase.case_number} has been sent to the operations desk.`);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      addToast('error', 'Request Failed', parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/dispatcher"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to admin queue
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-emerald-600" /> User Emergency Dashboard
            </h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="p-5 rounded-2xl bg-white border border-emerald-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-900">
                  Gemini AI Emergency Analyzer
                </h2>
              </div>
              <button
                type="button"
                onClick={handleUseDemoText}
                className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer"
              >
                ⚡ Use Pune Demo Incident
              </button>
            </div>

            <div className="space-y-3">
              <textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                rows={3}
                placeholder='Enter unstructured emergency description (e.g., "62 year old male involved in a highway accident near FC Road, Deccan Gymkhana, Pune. Severe bleeding, difficulty breathing and suspected chest trauma.")'
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAnalyzeWithGemini}
                  disabled={aiAnalyzing || !aiInput.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
                >
                  {aiAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Gemini is analyzing the incident...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> [ Analyze with Gemini ]
                    </>
                  )}
                </button>
              </div>
            </div>

            {aiError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {aiAnalysis && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Extracted Parameters
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                    {aiAnalysis.severity}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Patient Age</span>
                    <p className="font-bold text-slate-800">
                      {aiAnalysis.patient_age ? `${aiAnalysis.patient_age} Years` : 'Not Specified'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Clinical Summary</span>
                    <p className="text-slate-700 font-medium">{aiAnalysis.summary}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Extracted Resources</span>
                  <div className="flex flex-wrap gap-2">
                    {aiAnalysis.required_resources.map((res, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold text-xs"
                      >
                        ✓ {res.resource_type} (×{res.quantity})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={handleApplyAnalysis}
                    className="px-4 py-2 rounded-lg font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> [ Populate Form with Analysis ]
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Emergency Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as EmergencySeverity)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="CRITICAL">CRITICAL (Life-threatening / Severe Trauma)</option>
                  <option value="HIGH">HIGH (Urgent medical intervention needed)</option>
                  <option value="MODERATE">MODERATE (Stable but requires care)</option>
                  <option value="LOW">LOW (Non-critical emergency)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Patient Age (Years)</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  placeholder="e.g. 45"
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Incident Description / Notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="e.g. Multi-vehicle collision on highway near Deccan with respiratory distress..."
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-red-500" /> Pickup Location Coordinates
              </h3>
              <span className="text-[11px] text-emerald-700 font-medium">Click map or select landmark below</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Presets:</span>
              {PUNE_PRESETS.map((preset) => {
                const isSelected =
                  Math.abs(parseFloat(latitude) - preset.latitude) < 0.001 &&
                  Math.abs(parseFloat(longitude) - preset.longitude) < 0.001;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setLatitude(preset.latitude.toFixed(6));
                      setLongitude(preset.longitude.toFixed(6));
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden relative" style={{ height: '220px' }}>
              <div ref={miniMapRef} className="w-full h-full" />
              <div className="absolute bottom-2 left-2 z-[400] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-700 shadow-sm border border-slate-200">
                Drag marker or click anywhere on map to set Pune pickup
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Pickup Latitude (-90 to 90)</label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Pickup Longitude (-180 to 180)</label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Required Hospital Resources
              </h3>
              <button
                type="button"
                onClick={handleAddRequirement}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Resource
              </button>
            </div>

            <div className="space-y-2.5">
              {requirements.map((req, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] uppercase font-semibold text-slate-400">Resource Type</label>
                    <select
                      value={req.resource_type}
                      onChange={(e) => handleRequirementChange(index, 'resource_type', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-semibold focus:outline-none"
                    >
                      {RESOURCE_TYPES.map((rt) => (
                        <option key={rt.type} value={rt.type}>
                          {rt.label} ({rt.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-28 space-y-1">
                    <label className="text-[10px] uppercase font-semibold text-slate-400">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={req.quantity}
                      onChange={(e) =>
                        handleRequirementChange(index, 'quantity', parseInt(e.target.value, 10) || 1)
                      }
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-mono text-center focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-3 sm:pt-5">
                    <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={req.required}
                        onChange={(e) => handleRequirementChange(index, 'required', e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Mandatory
                    </label>

                    <button
                      type="button"
                      onClick={() => handleRemoveRequirement(index)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors ml-auto"
                      title="Remove resource"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <Link
              to="/dispatcher"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending Request...
                </>
              ) : (
                'SEND EMERGENCY REQUEST'
              )}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Live status</h2>
              </div>
              {activeEmergency ? <StatusBadge status={activeEmergency.status} /> : null}
            </div>

            {loadingRecent ? (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading live emergency status...
              </div>
            ) : activeEmergency ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
                  <MapPin className="w-4 h-4" /> Case {activeEmergency.case_number}
                </div>

                <p className="text-sm text-slate-300">
                  {USER_STATUS_COPY[activeEmergency.status] || 'Emergency request is being processed.'}
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="rounded-xl bg-slate-800/80 p-3 border border-slate-700">
                    <div className="uppercase tracking-wide text-slate-400 mb-1">Severity</div>
                    <div className="font-bold text-white">{activeEmergency.severity}</div>
                  </div>
                  <div className="rounded-xl bg-slate-800/80 p-3 border border-slate-700">
                    <div className="uppercase tracking-wide text-slate-400 mb-1">Location</div>
                    <div className="font-bold text-white">{`${activeEmergency.pickup_latitude}, ${activeEmergency.pickup_longitude}`}</div>
                  </div>
                </div>

                {topRecommendation && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-100">
                    <div className="flex items-center gap-2 mb-2 text-emerald-200 font-semibold">
                      <Clock3 className="w-4 h-4" /> Recommended destination
                    </div>
                    <div className="font-bold text-white">{topRecommendation.hospital_name}</div>
                    <div className="mt-1 text-emerald-100/80">
                      ETA {topRecommendation.estimated_travel_minutes} min • Score {Math.round(topRecommendation.final_score)}%
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-300">
                No emergency request has been created yet. Submit one from the form to begin live tracking.
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">Response workflow</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                  <span>Tracking</span>
                  <span>{Math.round(workflowProgress)}%</span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 transition-all duration-500"
                    style={{ width: `${workflowProgress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {STATUS_SEQUENCE.map((status, idx) => {
                  const isDone = idx < (workflowIndex >= 0 ? workflowIndex : 0);
                  const isCurrent = idx === workflowIndex;
                  const isPending = idx > (workflowIndex >= 0 ? workflowIndex : -1);

                  return (
                    <div
                      key={status}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] ${
                        isDone
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : isCurrent
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : isCurrent
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-semibold">
                        {status.replace('_', ' ')}
                      </span>
                      {isPending && <span className="ml-auto text-[9px] uppercase tracking-wide">Queued</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {activeEmergency && selectedHospital && liveEmergencyPoint && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Live ambulance simulation</h3>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {userSimulation?.status ?? 'IDLE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">ETA</div>
                  <div className="font-bold text-slate-800">{formatDuration(userSimulation?.etaSecondsRemaining ?? 0)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Distance left</div>
                  <div className="font-bold text-slate-800">{userSimulation ? `${userSimulation.distanceRemainingKm.toFixed(1)} km` : '0.0 km'}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Progress</div>
                  <div className="font-bold text-slate-800">{userSimulation ? `${Math.round(userSimulation.progress * 100)}%` : '0%'}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Destination</div>
                  <div className="font-bold text-slate-800 truncate">{selectedHospital.name}</div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                  <span>Route progress</span>
                  <span>{userSimulation ? `${Math.round(userSimulation.progress * 100)}%` : '0%'}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 transition-all duration-300"
                    style={{ width: `${userSimulation ? Math.min(100, Math.max(0, userSimulation.progress * 100)) : 0}%` }}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <PuneMap
                  hospitals={hospitals}
                  emergencyPoint={liveEmergencyPoint}
                  ambulances={liveAmbulance}
                  ambulanceSimulation={userSimulation}
                  selectedHospitalId={selectedHospital.id}
                  onSelectHospital={() => undefined}
                  onRouteInfoChange={setLiveRouteInfo}
                  recommendations={recommendations?.recommendations ?? []}
                  height="260px"
                />
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">Dispatch notes</h3>
            <ul className="space-y-3 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500" />
                Your request is sent to the dispatcher queue immediately.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500" />
                Live status updates appear here without reloading the page.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500" />
                The same emergency WebSocket feed powers admin updates in real time.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
