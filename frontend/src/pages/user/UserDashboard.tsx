import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  Mic,
  MapPin,
  Plus,
  ShieldAlert,
  Square,
  Sparkles,
  Trash2,
  Truck,
} from 'lucide-react';
import { useToast } from '../../components/common/Toast';
import { PUNE_PRESETS, PuneMap, type EmergencyPoint } from '../../components/map/PuneMap';
import { StatusBadge } from '../../components/emergencies/StatusBadge';
import { useWebSocket } from '../../hooks/useWebSocket';
import { parseApiError } from '../../services/api';
import { createEmergency, getEmergencies, getEmergencyById } from '../../services/emergencyApi';
import { getRecommendations } from '../../services/allocationApi';
import { getHospitals } from '../../services/hospitalApi';
import { getAmbulances } from '../../services/ambulanceApi';
import { getEmergencyRequests } from '../../services/allocationApi';
import type { RecommendationResponse } from '../../types/allocation';
import type { Ambulance } from '../../types/ambulance';
import type { EmergencyCase, EmergencyCaseCreate, EmergencyRequirementCreate, EmergencySeverity } from '../../types/emergency';
import type { Hospital, ResourceType } from '../../types/hospital';
import { analyzeEmergencyDescription } from '../../services/aiApi';
import type { EmergencyAnalyzeResponse } from '../../services/aiApi';
import { transcribeEmergencyAudio } from '../../services/aiApi';

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

type TransitProgress = {
  progress: number;
  etaSecondsRemaining: number | null;
  distanceRemainingKm: number | null;
  phase: 'TO_PATIENT' | 'TO_HOSPITAL' | 'ARRIVED' | 'HANDOFF_COMPLETED';
};

const formatTransitEta = (seconds: number | null) => {
  if (seconds === null) return 'Calculating…';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${remainder}s`;
};

const getWorkflowProgress = (status: string): number => {
  if (status === 'CANCELLED') return 0;
  const index = STATUS_SEQUENCE.indexOf(status as (typeof STATUS_SEQUENCE)[number]);
  if (index === -1) return 0;
  return ((index + 1) / STATUS_SEQUENCE.length) * 100;
};

export const UserDashboard: React.FC = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { id: routeEmergencyId } = useParams<{ id: string }>();
  const detailMode = Boolean(routeEmergencyId);

  const [aiInput, setAiInput] = useState<string>('');
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<EmergencyAnalyzeResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const [severity, setSeverity] = useState<EmergencySeverity>('CRITICAL');
  const [patientAge, setPatientAge] = useState<string>('45');
  const [description, setDescription] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('18.520400');
  const [longitude, setLongitude] = useState<string>('73.841000');
  const [requirements, setRequirements] = useState<EmergencyRequirementCreate[]>([
    { resource_type: 'ICU_BED', quantity: 1, required: true },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEmergency, setActiveEmergency] = useState<EmergencyCase | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [assignedHospital, setAssignedHospital] = useState<Hospital | null>(null);
  const [assignedAmbulance, setAssignedAmbulance] = useState<Ambulance | null>(null);
  const [transitProgress, setTransitProgress] = useState<TransitProgress | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('Pickup location not shared yet');
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => () => {
    recorderRef.current?.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const handleRecordAudio = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAiError('Audio recording is not supported by this browser. You can type the emergency details instead.');
      return;
    }

    try {
      setAiError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const preferredType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => {
        setIsRecording(false);
        setAiError('Recording failed. Please try again or type the emergency details.');
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!audio.size) return;
        setIsTranscribing(true);
        try {
          const transcript = await transcribeEmergencyAudio(audio);
          setAiInput(transcript);
          setAiAnalysis(null);
          setAiError(null);
          addToast('success', 'Audio Transcribed', 'The transcript was added to the Analyze by Gemini text box.');
        } catch (err) {
          const message = parseApiError(err).message;
          setAiError(message);
          addToast('error', 'Transcription Failed', message);
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow microphone access or type the emergency details.'
        : 'Could not start recording. Check your microphone and try again.';
      setAiError(message);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  };

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
        setLocationMessage('Manual pickup location selected');
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        setLatitude(e.latlng.lat.toFixed(6));
        setLongitude(e.latlng.lng.toFixed(6));
        setLocationMessage('Manual pickup location selected');
      });

      markerRef.current = marker;
      miniMapInstance.current = map;
    } else {
      if (markerRef.current) {
        markerRef.current.setLatLng([latNum, lonNum]);
      }
      miniMapInstance.current.setView([latNum, lonNum], miniMapInstance.current.getZoom());
    }
    miniMapInstance.current?.invalidateSize();
  }, [latitude, longitude, showLocationPicker]);

  useEffect(() => {
    let cancelled = false;
    if (routeEmergencyId) {
      setActiveEmergency(null);
      setLoadingRecent(true);
      setError(null);
    }
    const fetchRecent = async () => {
      try {
        const hospitalList = await getHospitals();
        if (cancelled) return;
        setHospitals(hospitalList);

        if (routeEmergencyId) {
          const caseId = Number(routeEmergencyId);
          if (!Number.isSafeInteger(caseId) || caseId <= 0) throw new Error('Invalid emergency case');
          const selectedCase = await getEmergencyById(caseId);
          if (cancelled) return;
          setActiveEmergency(selectedCase);
          await loadRecommendations(selectedCase.id);
        } else {
          const emergencyList = await getEmergencies();
          if (cancelled) return;
          const sorted = [...emergencyList].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const latest = sorted[0] || null;
          setActiveEmergency(latest);
          if (latest) await loadRecommendations(latest.id);
        }
      } catch (err) {
        if (!cancelled) {
          if (routeEmergencyId) setError(parseApiError(err).message);
          else console.warn('Unable to load recent emergency request:', err);
        }
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    };

    void fetchRecent();
    return () => { cancelled = true; };
  }, [loadRecommendations, routeEmergencyId]);

  useWebSocket(['EMERGENCY_STATUS_UPDATED', 'AMBULANCE_STATUS_UPDATED', 'AUTOMATION_INTERVENTION_REQUIRED'], (payload) => {
    if (!payload.data) return;

    if (payload.event === 'AMBULANCE_STATUS_UPDATED') {
      if (!activeEmergency || Number(payload.data.emergency_id) !== activeEmergency.id) return;
      const tripProgress = Number(payload.data.trip_progress);
      if (Number.isFinite(tripProgress)) {
        setTransitProgress({
          progress: Math.min(1, Math.max(0, tripProgress)),
          etaSecondsRemaining: Number.isFinite(Number(payload.data.eta_seconds_remaining)) ? Number(payload.data.eta_seconds_remaining) : null,
          distanceRemainingKm: Number.isFinite(Number(payload.data.distance_remaining_km)) ? Number(payload.data.distance_remaining_km) : null,
          phase: payload.data.trip_phase || (tripProgress >= 1 ? 'ARRIVED' : 'TO_PATIENT'),
        });
      } else if (payload.data.status === 'EN_ROUTE') {
        setTransitProgress((current) => current ?? {
          progress: 0,
          etaSecondsRemaining: null,
          distanceRemainingKm: null,
          phase: 'TO_PATIENT',
        });
      } else if (payload.data.status === 'ARRIVED' || payload.data.status === 'AVAILABLE') {
        setTransitProgress({ progress: 1, etaSecondsRemaining: 0, distanceRemainingKm: 0, phase: 'ARRIVED' });
      }
      void getAmbulances().then((units) => {
        setAssignedAmbulance(units.find((unit) => unit.id === activeEmergency.assigned_ambulance_id) || null);
      }).catch(() => undefined);
      return;
    }

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

    void getEmergencyById(emergencyId).then((updated) => setActiveEmergency(updated)).catch(() => undefined);
    void loadRecommendations(emergencyId);
  });

  useEffect(() => {
    if (!activeEmergency) {
      setTransitProgress(null);
    } else if (activeEmergency.status === 'HANDOFF_COMPLETED') {
      setTransitProgress({ progress: 1, etaSecondsRemaining: 0, distanceRemainingKm: 0, phase: 'HANDOFF_COMPLETED' });
    } else if (activeEmergency.status === 'ARRIVED') {
      setTransitProgress({ progress: 1, etaSecondsRemaining: 0, distanceRemainingKm: 0, phase: 'ARRIVED' });
    } else if (activeEmergency.status === 'EN_ROUTE') {
      setTransitProgress((current) => current ?? {
        progress: 0,
        etaSecondsRemaining: null,
        distanceRemainingKm: null,
        phase: 'TO_PATIENT',
      });
    } else if (['CREATED', 'SEARCHING', 'HOSPITAL_SELECTED'].includes(activeEmergency.status)) {
      setTransitProgress(null);
    }
  }, [activeEmergency?.id, activeEmergency?.status]);

  const topRecommendation = useMemo(
    () => recommendations?.recommendations[0] ?? null,
    [recommendations]
  );

  const selectedHospital = assignedHospital;
  const selectedRecommendation = useMemo(
    () => recommendations?.recommendations.find((item) => item.hospital_id === selectedHospital?.id) ?? topRecommendation,
    [recommendations, selectedHospital?.id, topRecommendation]
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

  useEffect(() => {
    let cancelled = false;
    const loadAssignment = async () => {
      if (!activeEmergency) { setAssignedHospital(null); setAssignedAmbulance(null); return; }
      try {
        const [requests, ambulances] = await Promise.all([getEmergencyRequests(activeEmergency.id), getAmbulances()]);
        if (cancelled) return;
        const accepted = requests.find((request) => request.status === 'ACCEPTED');
        setAssignedHospital(hospitals.find((hospital) => hospital.id === accepted?.hospital_id) || null);
        setAssignedAmbulance(ambulances.find((ambulance) => ambulance.id === activeEmergency.assigned_ambulance_id) || null);
      } catch { if (!cancelled) { setAssignedHospital(null); setAssignedAmbulance(null); } }
    };
    void loadAssignment();
    return () => { cancelled = true; };
  }, [activeEmergency, hospitals]);

  const handleUseDemoText = () => {
    setAiInput(DEMO_EMERGENCY_TEXT);
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location sharing is not supported by this browser. Choose a location manually.');
      setShowLocationPicker(true);
      return;
    }

    setLocationBusy(true);
    setLocationMessage('Finding your current location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        setLocationMessage('Your pickup location is ready');
        setLocationBusy(false);
      },
      (locationError) => {
        setLocationMessage(
          locationError.code === locationError.PERMISSION_DENIED
            ? 'Location permission was not granted. Choose a location manually.'
            : 'Could not find your location. Choose a location manually.'
        );
        setShowLocationPicker(true);
        setLocationBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
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
    // Preserve the original transcript in the emergency record while Gemini
    // supplies structured severity, age, and resource values.
    setDescription(aiInput.trim() || aiAnalysis.summary);

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
    const emergencyDescription = description.trim() || aiInput.trim();

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

    if (!emergencyDescription) {
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
        description: emergencyDescription,
        pickup_latitude: latNum,
        pickup_longitude: lonNum,
        requirements,
      } as EmergencyCaseCreate);

      setActiveEmergency(createdCase);
      navigate(`/user/emergency/${createdCase.id}`);
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
    <div className="mx-auto max-w-[1500px] pb-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          {detailMode && <Link to="/user" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft className="w-4 h-4" /> New emergency request</Link>}
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldAlert className="h-6 w-6 text-emerald-600" /> {detailMode ? 'Emergency response' : 'Get emergency help'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{detailMode ? 'Your request, live progress, and hospital handoff in one place.' : 'Tell us what happened. Dispatch will coordinate the next steps.'}</p>
        </div>
        {!detailMode && activeEmergency && <Link to={`/user/emergency/${activeEmergency.id}`} className="shrink-0 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-800 shadow-sm hover:bg-teal-50">Track latest request</Link>}
      </div>

      <div className={`grid grid-cols-1 gap-5 ${detailMode ? 'xl:grid-cols-1' : 'mx-auto max-w-3xl'}`}>
        {!detailMode && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
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
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleRecordAudio()}
                  disabled={isTranscribing}
                  aria-pressed={isRecording}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-colors disabled:opacity-50 ${isRecording ? 'bg-rose-700 hover:bg-rose-800 text-white' : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200'}`}
                >
                  {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
                  {isTranscribing ? 'Transcribing…' : isRecording ? 'Stop recording' : 'Speak to fill this field'}
                </button>
                <span className="text-[11px] text-slate-600">Speech is transcribed into this editable text box. Pickup location is entered separately below.</span>
              </div>
              {(isRecording || isTranscribing) && (
                <p role="status" className="text-xs text-teal-800">{isRecording ? 'Recording… stop when you are done speaking.' : 'Converting speech to text…'}</p>
              )}
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

          <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">Optional patient and clinical details</summary>
            <div className="mt-4 space-y-4">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">Incident Description / Notes</label>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="e.g. Multi-vehicle collision on highway near Deccan with respiratory distress..."
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          </details>

          <div className="space-y-4">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><MapPin className="h-4 w-4 text-rose-500" /> Pickup location</h3>
              <p className="mt-1 text-[11px] text-slate-500">Share your current location or choose one manually.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleShareLocation} disabled={locationBusy} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"><MapPin className="h-4 w-4" />{locationBusy ? 'Finding location…' : 'Share my location'}</button>
              <button type="button" onClick={() => setShowLocationPicker((open) => !open)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">{showLocationPicker ? 'Hide map options' : 'Choose location manually'}</button>
              <span role="status" className="text-[11px] text-slate-500">{locationMessage}</span>
            </div>

            {showLocationPicker && <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
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
                      setLocationMessage(`Pickup location set to ${preset.name}`);
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
            </div>}
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">Hospital resources needed (optional)</summary>
            <div className="mt-4 space-y-4">
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
            <p className="text-xs leading-5 text-slate-500">
              Every mandatory resource listed here must be available at the hospital. Keep only the resources the patient needs; add more when clinically required.
            </p>

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
            </div>
          </details>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
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
                'Create emergency'
              )}
            </button>
          </div>
        </form>
        )}

        {detailMode && (
        <div className="space-y-6">
          {!activeEmergency && loadingRecent && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-teal-600" />Loading your emergency response…</div>}
          {!activeEmergency && !loadingRecent && <div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-semibold text-slate-800">We could not load this emergency request.</p><p className="mt-1 text-xs text-slate-500">It may no longer be available on your account.</p><Link to="/user" className="mt-4 inline-flex text-xs font-bold text-teal-700">Start a new request</Link></div>}
          {activeEmergency && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-700">Emergency transcript</p><h2 className="mt-1 text-lg font-bold text-slate-900">Case {activeEmergency.case_number}</h2></div><StatusBadge status={activeEmergency.status} /></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{activeEmergency.description}</p><div className="mt-4 flex flex-wrap gap-2 text-[11px]"><span className="rounded-lg bg-slate-50 px-3 py-1.5 font-semibold text-slate-600">Severity: {activeEmergency.severity}</span>{activeEmergency.patient_age != null && <span className="rounded-lg bg-slate-50 px-3 py-1.5 font-semibold text-slate-600">Age: {activeEmergency.patient_age}</span>}{activeEmergency.requirements?.map((item, index) => <span key={`${item.resource_type}-${index}`} className="rounded-lg bg-teal-50 px-3 py-1.5 font-semibold text-teal-800">{item.resource_type.replaceAll('_', ' ')} ×{item.quantity}</span>)}</div></section>}
          {activeEmergency && (<>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Activity className="w-4 h-4" /></span>
                <div><h2 className="text-sm font-bold text-slate-900">Live response</h2><p className="text-[11px] text-slate-500">Updates automatically as dispatch progresses</p></div>
              </div>
              {activeEmergency ? <StatusBadge status={activeEmergency.status} /> : null}
            </div>

            {loadingRecent ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading live emergency status...
              </div>
            ) : activeEmergency ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-800 text-sm font-bold"><MapPin className="w-4 h-4" /> Case {activeEmergency.case_number}</div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                    {activeEmergency.status === 'HANDOFF_COMPLETED'
                      ? <CheckCircle2 className="h-4 w-4" />
                      : <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                    {activeEmergency.status === 'HANDOFF_COMPLETED' ? 'Response complete' : 'Live tracking'}
                  </span>
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  {USER_STATUS_COPY[activeEmergency.status] || 'Emergency request is being processed.'}
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <div className="uppercase tracking-wide text-slate-400 mb-1">Severity</div>
                    <div className="font-bold text-slate-800">{activeEmergency.severity}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <div className="uppercase tracking-wide text-slate-400 mb-1">Location</div>
                    <div className="font-bold text-slate-800">{`${Number(activeEmergency.pickup_latitude).toFixed(4)}, ${Number(activeEmergency.pickup_longitude).toFixed(4)}`}</div>
                  </div>
                </div>

                {topRecommendation && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs">
                    <div className="flex items-center gap-2 mb-2 text-emerald-800 font-semibold">
                      <Clock3 className="w-4 h-4" /> Recommended destination
                    </div>
                    <div className="font-bold text-slate-800">{topRecommendation.hospital_name}</div>
                    <div className="mt-1 text-slate-600">
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
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 className="text-sm font-bold text-slate-900">Your response progress</h3><p className="mt-0.5 text-[11px] text-slate-500">Steps update as dispatch confirms them</p></div>
              <span className="text-sm font-bold tabular-nums text-emerald-700">{Math.round(workflowProgress)}%</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 transition-all duration-500"
                    style={{ width: `${workflowProgress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
                {STATUS_SEQUENCE.map((status, idx) => {
                  const isDone = activeEmergency?.status === 'HANDOFF_COMPLETED' || idx < workflowIndex;
                  const isCurrent = idx === workflowIndex && !isDone;
                  const isPending = !isDone && !isCurrent;

                  return (
                    <div
                      key={status}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-xl border p-3 text-[11px] transition-colors ${
                        isDone
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : isCurrent
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800 shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : isCurrent
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                        </span>
                        {isCurrent && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                      </span>
                      <span className="font-semibold leading-tight">{status.replace('_', ' ')}</span>
                      <span className={`text-[9px] font-semibold uppercase tracking-wide ${isCurrent ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {isDone ? 'Complete' : isCurrent ? 'In progress' : isPending ? 'Up next' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </>)}

          {activeEmergency && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Response tracking</h3>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {assignedAmbulance?.status || activeEmergency.status.replace('_', ' ')}
                </span>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">Assigned hospital</p><p className="mt-1 font-bold text-slate-800">{selectedHospital?.name || 'Awaiting hospital confirmation'}</p></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">Ambulance</p><p className="mt-1 font-bold text-slate-800">{assignedAmbulance?.vehicle_number || (activeEmergency.assigned_ambulance_id ? `Unit #${activeEmergency.assigned_ambulance_id}` : 'Not assigned yet')}</p></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">Receiving clinician</p><p className="mt-1 font-bold text-slate-800">{activeEmergency.assigned_doctor_name || 'Assigned automatically at hospital arrival'}</p></div>
              </div>
              {activeEmergency.status === 'EN_ROUTE' && (
                <div className="mb-4 rounded-2xl border border-teal-200 bg-teal-50 p-4" aria-live="polite">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-teal-700 shadow-sm"><Truck size={19} /></span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-teal-800">
                          {transitProgress?.phase === 'TO_HOSPITAL' ? 'Patient aboard · travelling to hospital' : 'Ambulance travelling to pickup'}
                        </p>
                        <p className="mt-1 text-[11px] text-teal-700">Live trip simulation · vehicle position updates automatically</p>
                      </div>
                    </div>
                    <div className="flex gap-5 text-right">
                      <div><p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">ETA</p><p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatTransitEta(transitProgress?.etaSecondsRemaining ?? null)}</p></div>
                      <div><p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">Distance</p><p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{transitProgress?.distanceRemainingKm === null || transitProgress?.distanceRemainingKm === undefined ? 'Calculating…' : `${transitProgress.distanceRemainingKm.toFixed(1)} km`}</p></div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-teal-800"><span>Trip progress</span><span>{Math.round((transitProgress?.progress ?? 0) * 100)}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-teal-600 transition-all duration-700" style={{ width: `${Math.round((transitProgress?.progress ?? 0) * 100)}%` }} /></div>
                  </div>
                </div>
              )}
              {selectedHospital && (
                <div className="mb-4 grid gap-4 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-white p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">Destination hospital</p>
                    <p className="mt-1 truncate text-base font-bold text-slate-900">{selectedHospital.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{selectedHospital.address || 'Hospital destination confirmed by dispatch'}</p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/80 px-4 py-2.5 sm:min-w-[112px]">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{activeEmergency.status === 'EN_ROUTE' ? 'Time remaining' : 'Estimated travel'}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums text-teal-800">
                      <Clock3 className="h-4 w-4" />
                      {activeEmergency.status === 'EN_ROUTE'
                        ? formatTransitEta(transitProgress?.etaSecondsRemaining ?? null)
                        : selectedRecommendation?.estimated_travel_minutes != null
                          ? `${selectedRecommendation.estimated_travel_minutes} min`
                          : 'Calculating'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/80 px-4 py-2.5 sm:min-w-[112px]">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{activeEmergency.status === 'EN_ROUTE' ? 'Distance left' : 'Route distance'}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums text-slate-800">
                      <MapPin className="h-4 w-4 text-teal-700" />
                      {activeEmergency.status === 'EN_ROUTE'
                        ? transitProgress?.distanceRemainingKm == null
                          ? 'Calculating'
                          : `${transitProgress.distanceRemainingKm.toFixed(1)} km`
                        : selectedRecommendation?.distance_km != null
                          ? `${selectedRecommendation.distance_km.toFixed(2)} km`
                          : 'Calculating'}
                    </p>
                  </div>
                </div>
              )}
              {liveEmergencyPoint && <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-inner"><PuneMap hospitals={hospitals} emergencyPoint={liveEmergencyPoint} ambulances={assignedAmbulance ? [assignedAmbulance] : []} selectedHospitalId={selectedHospital?.id ?? null} onSelectHospital={() => undefined} recommendations={recommendations?.recommendations ?? []} height="360px" showRouteInfo={false}/></div>}
              {!assignedAmbulance && <p className="mt-3 text-xs leading-5 text-slate-500">This view updates from your case and ambulance records. Live vehicle location appears when dispatch has assigned a unit and reported its coordinates.</p>}
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
        )}
      </div>
    </div>
  );
};
