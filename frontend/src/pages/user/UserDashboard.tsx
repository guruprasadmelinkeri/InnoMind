import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Keyboard,
  Loader2,
  MessageCircle,
  Mic,
  MapPin,
  Plus,
  Phone,
  ShieldAlert,
  Square,
  Sparkles,
  Trash2,
  Truck,
  Video,
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
import { addEmergencyContact, deleteEmergencyContact, getEmergencyContacts, type EmergencyContact } from '../../services/emergencyContactsApi';

const RESOURCE_TYPES: { type: ResourceType; label: string }[] = [
  { type: 'ICU_BED', label: 'ICU Bed' },
  { type: 'GENERAL_BED', label: 'General Bed' },
  { type: 'VENTILATOR', label: 'Ventilator' },
  { type: 'OXYGEN_BED', label: 'Oxygen Bed' },
  { type: 'TRAUMA_BED', label: 'Trauma Bed' },
  { type: 'OPERATING_ROOM', label: 'Operating Room' },
];

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
  const [searchParams] = useSearchParams();
  const detailMode = Boolean(routeEmergencyId);
  const caseDetailsMode = searchParams.get('view') === 'details';

  const [aiInput, setAiInput] = useState<string>('');
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<EmergencyAnalyzeResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [intakeMode, setIntakeMode] = useState<'voice' | 'type' | null>(null);
  const [intakeRole, setIntakeRole] = useState<'public' | 'professional' | null>(null);
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
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [showMoneyRequest, setShowMoneyRequest] = useState(false);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [moneyRequestText, setMoneyRequestText] = useState('');
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState('');
  const [savedInsurancePolicyNumber, setSavedInsurancePolicyNumber] = useState('');
  const [expandedSupportPanel, setExpandedSupportPanel] = useState<'map' | 'support'>('support');
  const [representativeMode, setRepresentativeMode] = useState<'call' | 'chat' | 'video' | null>(null);
  const [videoPanelWidth, setVideoPanelWidth] = useState(50);
  const [contactLabel, setContactLabel] = useState('');
  const [contactValue, setContactValue] = useState('');
  const [contactType, setContactType] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [savingContact, setSavingContact] = useState(false);

  const loadEmergencyContacts = useCallback(async () => {
    try { setEmergencyContacts(await getEmergencyContacts()); }
    catch (err) { addToast('error', 'Contacts unavailable', parseApiError(err).message); }
  }, [addToast]);

  useEffect(() => { void loadEmergencyContacts(); }, [loadEmergencyContacts]);

  const handleAddEmergencyContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingContact(true);
    try {
      const contact = await addEmergencyContact({ label: contactLabel.trim(), contact_type: contactType, value: contactValue.trim() });
      setEmergencyContacts((current) => [...current, contact]);
      setContactLabel('');
      setContactValue('');
      addToast('success', 'Contact saved', 'They will be notified when a hospital accepts your emergency.');
    } catch (err) { addToast('error', 'Could not save contact', parseApiError(err).message); }
    finally { setSavingContact(false); }
  };

  const handlePrepareMoneyRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(requestAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !activeEmergency) return;
    const message = `I need help with emergency expenses for case ${activeEmergency.case_number}. Amount requested: ₹${amount.toLocaleString('en-IN')}.${requestNote.trim() ? ` ${requestNote.trim()}` : ''}`;
    setMoneyRequestText(message);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Emergency assistance request', text: message });
        addToast('success', 'Request ready', 'Your emergency assistance message was shared.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        addToast('success', 'Request ready', 'Your emergency assistance message was copied.');
      } else {
        addToast('info', 'Request ready to share', 'Copy the prepared message below and send it to your contacts.');
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) addToast('info', 'Request ready to share', 'Copy the prepared message below and send it to your contacts.');
    }
  };

  const handleSaveInsuranceNumber = (event: React.FormEvent) => {
    event.preventDefault();
    setSavedInsurancePolicyNumber(insurancePolicyNumber.trim());
    setShowInsuranceForm(false);
    addToast('success', 'Policy number added', 'The number is available on this page.');
  };

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
          addToast('success', 'Audio Transcribed', 'The transcript was added to the emergency description.');
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

  useEffect(() => {
    if (activeEmergency?.assigned_ambulance_id) setExpandedSupportPanel('map');
  }, [activeEmergency?.assigned_ambulance_id]);

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
  const hasOngoingEmergency = Boolean(activeEmergency && !['HANDOFF_COMPLETED', 'CANCELLED'].includes(activeEmergency.status));

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
      setSeverity(result.severity);
      if (result.patient_age !== undefined && result.patient_age !== null) setPatientAge(String(result.patient_age));
      setDescription(aiInput.trim() || result.summary);
      if (result.required_resources.length > 0) {
        setRequirements(result.required_resources.map((resource) => ({
          resource_type: resource.resource_type,
          quantity: resource.quantity,
          required: true,
        })));
      }
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

  const chooseReporter = (role: 'public' | 'professional') => {
    setIntakeRole(role);
    setDescription(aiInput.trim());
    if (role === 'public') void handleAnalyzeWithGemini();
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

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
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
      addToast('success', 'Emergency Request Sent', `Case ${createdCase.case_number} has been sent to the operations desk.`);
      navigate(`/user/emergency/${createdCase.id}`);
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
          {detailMode && <Link to={caseDetailsMode ? `/user/emergency/${routeEmergencyId}` : '/user'} className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft className="w-4 h-4" /> {caseDetailsMode ? 'Back to current progress' : 'New emergency request'}</Link>}
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldAlert className="h-6 w-6 text-emerald-600" /> {detailMode ? 'Emergency response' : 'Get emergency help'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{detailMode ? caseDetailsMode ? 'Full information for your emergency request.' : 'Your current response stage and nearby hospitals.' : 'Tell us what happened. Dispatch will coordinate the next steps.'}</p>
        </div>
        {!detailMode && hasOngoingEmergency && activeEmergency && <Link to={`/user/emergency/${activeEmergency.id}`} className="shrink-0 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-800 shadow-sm hover:bg-teal-50">Track ongoing request</Link>}
      </div>

      <div className={`grid grid-cols-1 gap-5 ${detailMode ? 'xl:grid-cols-1' : 'mx-auto w-full max-w-6xl'}`}>
        {!detailMode && (
        <form onSubmit={handleSubmit} className={intakeRole ? 'space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6' : 'space-y-6'}>
          {!intakeRole ? <section className="flex min-h-[calc(100dvh-13rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50 p-5 shadow-[0_18px_55px_-30px_rgba(15,118,110,0.32)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-left"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Start your request</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">How would you like to tell us?</h2><p className="mt-2 text-sm text-slate-500">Choose the easiest way. You can review everything before sending.</p></div>
              <span className="rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-500">Step 1 of 3</span>
            </div>
            {!intakeMode ? <div className="mt-6 grid w-full flex-1 grid-cols-1 grid-rows-2 gap-4 sm:grid-cols-2 sm:grid-rows-1">
              <button type="button" onClick={() => { setIntakeMode('voice'); void handleRecordAudio(); }} className="group flex h-full min-h-[12rem] w-full flex-col items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-700 px-6 py-8 text-center text-white shadow-lg shadow-emerald-900/10 transition duration-200 hover:-translate-y-1 hover:bg-emerald-800 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300">
                <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 transition group-hover:scale-105"><Mic className="h-10 w-10" strokeWidth={1.8}/></span><span className="text-xl font-bold">Talk about the emergency</span><span className="mt-2 max-w-xs text-sm leading-6 text-emerald-50">Describe what happened aloud, then review the transcript.</span>
              </button>
              <button type="button" onClick={() => setIntakeMode('type')} className="group flex h-full min-h-[12rem] w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/90 px-6 py-8 text-center text-slate-800 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:bg-white hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200">
                <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition group-hover:scale-105"><Keyboard className="h-10 w-10" strokeWidth={1.8}/></span><span className="text-xl font-bold">I will type</span><span className="mt-2 max-w-xs text-sm leading-6 text-slate-500">Write a short description of the situation.</span>
              </button>
            </div> : <div className="mx-auto max-w-2xl space-y-4">
              {intakeMode === 'voice' && <button type="button" onClick={() => void handleRecordAudio()} disabled={isTranscribing} aria-label={isRecording ? 'Stop recording' : 'Record emergency description'} className={`mx-auto rounded-full p-6 text-white ${isRecording ? 'bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{isTranscribing ? <Loader2 className="h-9 w-9 animate-spin"/> : isRecording ? <Square className="h-9 w-9 fill-current"/> : <Mic className="h-9 w-9"/>}</button>}
              {(isRecording || isTranscribing) && <p role="status" className="flex items-center justify-center gap-2 text-xs text-emerald-800">{isRecording && <span aria-hidden="true" className="flex h-5 items-center gap-0.5"><i className="recording-wave-bar"/><i className="recording-wave-bar"/><i className="recording-wave-bar"/><i className="recording-wave-bar"/><i className="recording-wave-bar"/></span>}{isRecording ? 'Recording… tap the microphone when you are done.' : 'Converting speech to text…'}</p>}
              <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} rows={3} placeholder={intakeMode === 'voice' ? 'Your spoken description will appear here. You can edit it.' : 'Describe what happened and any urgent symptoms…'} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p className="text-xs text-slate-500">Who is reporting this emergency?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={!aiInput.trim() || aiAnalyzing} onClick={() => chooseReporter('public')} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left font-bold text-sm text-slate-800 hover:bg-emerald-100 disabled:opacity-50">I am not a medical professional</button>
                <button type="button" disabled={!aiInput.trim()} onClick={() => chooseReporter('professional')} className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-left font-bold text-sm text-slate-800 hover:bg-indigo-100 disabled:opacity-50">I am a medical professional</button>
              </div>
            </div>}
            {aiError && <div className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0"/>{aiError}</div>}
          </section> : <>
            <div className={`rounded-xl border p-4 text-sm font-semibold flex items-center gap-3 ${intakeRole === 'public' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-indigo-200 bg-indigo-50 text-indigo-900'}`}>
              {intakeRole === 'public' ? <Sparkles className="h-5 w-5"/> : <CheckCircle2 className="h-5 w-5"/>}
              {intakeRole === 'public' ? (aiAnalyzing ? 'Assessing the details…' : aiError ? 'Review the incident details below.' : 'Gemini assessment complete. Review the details below.') : 'Enter clinical details and hospital resources below.'}
              {aiAnalyzing && <Loader2 className="ml-auto h-4 w-4 animate-spin"/>}
            </div>
            {aiAnalysis && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs"><div className="font-bold text-slate-800">Suggested severity: {aiAnalysis.severity}</div><p className="mt-1 text-slate-600">{aiAnalysis.summary}</p></div>}
            {aiError && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle className="h-4 w-4 shrink-0"/>{aiError}</div>}
          </>}

          {intakeRole && <>
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              ⚠️ {error}
            </div>
          )}

          <details open={intakeRole === 'professional'} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
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

          <details open={intakeRole === 'professional'} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
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
          </>}
        </form>
        )}

        {detailMode && (
        <div className="space-y-6">
          {!activeEmergency && loadingRecent && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-teal-600" />Loading your emergency response…</div>}
          {!activeEmergency && !loadingRecent && <div className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-semibold text-slate-800">We could not load this emergency request.</p><p className="mt-1 text-xs text-slate-500">It may no longer be available on your account.</p><Link to="/user" className="mt-4 inline-flex text-xs font-bold text-teal-700">Start a new request</Link></div>}
          {caseDetailsMode ? <>
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
          </> : activeEmergency ? <>
            <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
            <div className="flex h-[620px] flex-col gap-4">
            <section className="h-28 shrink-0 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm" aria-live="polite">
              <div className="flex h-full items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Current progress</p>
                  <h2 className="mt-1 truncate text-base font-bold text-slate-900">{activeEmergency.assigned_ambulance_id ? (activeEmergency.status === 'EN_ROUTE' ? `Ambulance on the way · ${assignedAmbulance?.vehicle_number || `Unit #${activeEmergency.assigned_ambulance_id}`}` : activeEmergency.status === 'ARRIVED' ? 'Ambulance has arrived' : activeEmergency.status === 'HANDOFF_COMPLETED' ? 'Care handoff complete' : `Ambulance assigned · ${assignedAmbulance?.vehicle_number || `Unit #${activeEmergency.assigned_ambulance_id}`}`) : (USER_STATUS_COPY[activeEmergency.status] || 'Your emergency request is being processed.')}</h2>
                  {activeEmergency.assigned_ambulance_id && <p className="mt-0.5 truncate text-[11px] text-slate-600">Driver: {(assignedAmbulance as (Ambulance & { driver_name?: string }) | null)?.driver_name || 'Not shared by dispatch yet'}</p>}
                </div>
                <StatusBadge status={activeEmergency.status}/>
              </div>
            </section>

            <div className="flex min-h-0 flex-1 gap-3">
              <section style={{ flex: `${videoPanelWidth} 1 0%` }} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                <div className="p-3">
                  <h2 className="text-sm font-bold leading-snug text-amber-950">Don’t panic. Follow these steps till help arrives.</h2>
                  <p className="mt-1 text-xs text-slate-600">First aid video</p>
                </div>
                <div className="min-h-0 flex-1 border-t border-amber-100 bg-slate-950">
                  <iframe className="h-full w-full" src="https://www.youtube.com/embed/TsJ49Np3HS0?si=pty_azIVME2DsRPa" title="First aid video: steps to follow while help arrives" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
                </div>
              </section>

              <section style={{ flex: `${100 - videoPanelWidth} 1 0%` }} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
                <div className="p-3">
                  <h2 className="text-sm font-bold leading-snug text-slate-900">Contact our representative</h2>
                  <p className="mt-1 text-xs text-slate-500">Choose how you would like to connect.</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
                  <button type="button" onClick={() => setRepresentativeMode('call')} className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-semibold ${representativeMode === 'call' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Phone className="h-4 w-4"/>Call</button>
                  <button type="button" onClick={() => setRepresentativeMode('chat')} className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-semibold ${representativeMode === 'chat' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><MessageCircle className="h-4 w-4"/>Chat</button>
                  <button type="button" onClick={() => setRepresentativeMode('video')} className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-semibold ${representativeMode === 'video' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Video className="h-4 w-4"/>Video</button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center border-t border-slate-100 bg-slate-50 p-3 text-center">
                  {!representativeMode && <p className="text-xs text-slate-500">Select Call, Chat, or Video to open the connection panel.</p>}
                  {representativeMode === 'call' && <div className="space-y-2"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-teal-100 text-teal-700"><Phone className="h-5 w-5"/></span><p className="text-sm font-bold text-slate-800">Representative call</p><p className="text-xs text-slate-500">Call connection will be available soon.</p><button type="button" disabled className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white opacity-50">Call coming soon</button></div>}
                  {representativeMode === 'chat' && <div className="w-full space-y-2 text-left"><p className="text-sm font-bold text-slate-800">Representative chat</p><div className="rounded-lg bg-white p-2 text-xs text-slate-500 shadow-sm">Chat support will be available soon.</div><div className="flex gap-1"><input disabled placeholder="Type a message" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"/><button type="button" disabled className="rounded-lg bg-teal-700 px-2 text-xs text-white opacity-50">Send</button></div></div>}
                  {representativeMode === 'video' && <div className="space-y-2"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-200 text-slate-600"><Video className="h-5 w-5"/></span><p className="text-sm font-bold text-slate-800">Video call</p><p className="text-xs text-slate-500">Video connection will be available soon.</p><button type="button" disabled className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white opacity-50">Start video coming soon</button></div>}
                </div>
              </section>
            </div>
            <div className="flex h-5 shrink-0 items-center px-1" title="Drag left to expand representative panel; drag right to expand video panel">
              <input
                type="range"
                min="30"
                max="70"
                step="1"
                value={videoPanelWidth}
                onChange={(event) => setVideoPanelWidth(Number(event.target.value))}
                aria-label="Resize first aid video and representative panels"
                aria-valuetext={`Video panel ${videoPanelWidth} percent, representative panel ${100 - videoPanelWidth} percent`}
                className="h-2 w-full cursor-col-resize appearance-none rounded-full bg-slate-200 accent-teal-600"
              />
            </div>
            </div>

            <div className="flex h-[620px] flex-col gap-4">
              <section className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${expandedSupportPanel === 'map' ? 'min-h-0 flex-1 p-5' : 'h-[160px] shrink-0'}`}>
                {expandedSupportPanel === 'map' && <><h2 className="text-base font-bold text-slate-900">{activeEmergency.assigned_ambulance_id ? 'Live response map' : 'Nearby hospitals'}</h2><p className="mt-1 text-xs text-slate-500">{activeEmergency.assigned_ambulance_id ? 'Ambulance and hospitals near your case.' : 'Hospitals near your pickup location.'}</p></>}
                {liveEmergencyPoint ? <div className={`${expandedSupportPanel === 'map' ? 'mt-3' : 'h-full'} overflow-hidden rounded-xl border border-slate-200`}><PuneMap hospitals={hospitals} emergencyPoint={liveEmergencyPoint} ambulances={assignedAmbulance ? [assignedAmbulance] : []} selectedHospitalId={selectedHospital?.id ?? null} onSelectHospital={() => undefined} recommendations={recommendations?.recommendations ?? []} height={expandedSupportPanel === 'map' ? '260px' : '158px'} showRouteInfo={false} showControls={expandedSupportPanel === 'map'}/></div> : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Loading hospital map…</p>}
                {expandedSupportPanel === 'support' && <button type="button" onClick={() => setExpandedSupportPanel('map')} className="absolute right-3 top-3 z-[600] rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-800 shadow">Expand map</button>}
              </section>

              <section className={`min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${expandedSupportPanel === 'support' ? 'flex-1' : 'h-20 shrink-0'}`}>
                <button type="button" onClick={() => setExpandedSupportPanel('support')} className="text-left"><h2 className="text-base font-bold text-slate-900">Things you can do while you wait</h2>{expandedSupportPanel === 'map' && <p className="text-xs text-slate-500">Tap to open contacts, money, and insurance options.</p>}</button>
                {expandedSupportPanel === 'support' && <>
                <div className="mt-3 grid gap-2">
                  <button type="button" aria-expanded={showContactPanel} onClick={() => { setShowContactPanel((visible) => !visible); setShowMoneyRequest(false); setShowInsuranceForm(false); }} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100">Inform contacts</button>
                  <button type="button" aria-expanded={showMoneyRequest} onClick={() => { setShowMoneyRequest((visible) => !visible); setShowContactPanel(false); setShowInsuranceForm(false); }} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100">Request money</button>
                  <button type="button" aria-expanded={showInsuranceForm} onClick={() => { setShowInsuranceForm((visible) => !visible); setShowContactPanel(false); setShowMoneyRequest(false); }} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-950 hover:bg-sky-100">Add insurance</button>
                </div>

                {showContactPanel && <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">Contacts can receive hospital and pickup details after a hospital accepts your case.</p>
                  <form onSubmit={handleAddEmergencyContact} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input required maxLength={80} value={contactLabel} onChange={(event) => setContactLabel(event.target.value)} placeholder="Contact name" aria-label="Contact name" className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                    <select value={contactType} onChange={(event) => setContactType(event.target.value as 'PHONE' | 'EMAIL')} aria-label="Contact method" className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="PHONE">Phone / SMS</option><option value="EMAIL">Email</option></select>
                    <input required value={contactValue} onChange={(event) => setContactValue(event.target.value)} type={contactType === 'EMAIL' ? 'email' : 'tel'} placeholder={contactType === 'EMAIL' ? 'name@example.com' : '+91 phone number'} aria-label="Contact detail" className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-xs sm:col-span-2" />
                    <button disabled={savingContact || emergencyContacts.length >= 5} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2">{savingContact ? 'Saving…' : 'Add contact'}</button>
                  </form>
                  {emergencyContacts.length > 0 && <div className="mt-2 space-y-1">{emergencyContacts.map((contact) => <div key={contact.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-700">{contact.label} · {contact.value}</span><button type="button" aria-label={`Remove ${contact.label}`} onClick={async () => { try { await deleteEmergencyContact(contact.id); setEmergencyContacts((items) => items.filter((item) => item.id !== contact.id)); } catch (err) { addToast('error', 'Could not remove contact', parseApiError(err).message); } }} className="shrink-0 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
                </div>}

                {showMoneyRequest && <form onSubmit={handlePrepareMoneyRequest} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-medium text-slate-700">Amount needed (₹)<input required min="1" type="number" value={requestAmount} onChange={(event) => setRequestAmount(event.target.value)} placeholder="e.g. 5000" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
                  <textarea value={requestNote} onChange={(event) => setRequestNote(event.target.value)} rows={2} placeholder="Add a short note (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                  <button className="w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700">Share request</button>
                  {moneyRequestText && <textarea readOnly value={moneyRequestText} aria-label="Money request message" rows={2} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs" />}
                </form>}

                {showInsuranceForm && <form onSubmit={handleSaveInsuranceNumber} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-medium text-slate-700">Insurance policy number<input required value={insurancePolicyNumber} onChange={(event) => setInsurancePolicyNumber(event.target.value)} placeholder="Enter policy number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
                  <button className="w-full rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Add policy number</button>
                  {savedInsurancePolicyNumber && <p className="text-xs text-emerald-700">Added for this session: {savedInsurancePolicyNumber}</p>}
                </form>}
                </>}
              </section>
            </div>
            </div>

          </> : null}
        </div>
        )}
      </div>
    </div>
  );
};
