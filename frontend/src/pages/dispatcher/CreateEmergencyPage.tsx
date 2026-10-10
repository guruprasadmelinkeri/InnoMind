import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import L from 'leaflet';
import {
  ArrowLeft,
  ShieldAlert,
  Plus,
  Trash2,
  MapPin,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { createEmergency } from '../../services/emergencyApi';
import { analyzeEmergencyDescription } from '../../services/aiApi';
import type { EmergencyAnalyzeResponse } from '../../services/aiApi';
import type { EmergencySeverity, EmergencyRequirementCreate } from '../../types/emergency';
import type { ResourceType } from '../../types/hospital';
import { useToast } from '../../components/common/Toast';
import { parseApiError } from '../../services/api';
import { PUNE_PRESETS } from '../../components/map/PuneMap';

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

export const CreateEmergencyPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Gemini AI Analysis State
  const [aiInput, setAiInput] = useState<string>('');
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<EmergencyAnalyzeResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Form State (Default to Pune: FC Road / Deccan Gymkhana)
  const [severity, setSeverity] = useState<EmergencySeverity>('CRITICAL');
  const [patientAge, setPatientAge] = useState<string>('45');
  const [description, setDescription] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('18.520400');
  const [longitude, setLongitude] = useState<string>('73.841000');

  const [requirements, setRequirements] = useState<EmergencyRequirementCreate[]>([
    { resource_type: 'ICU_BED', quantity: 1, required: true },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Mini Leaflet Map Picker
  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

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

      const marker = L.marker([latNum, lonNum], {
        draggable: true,
      }).addTo(map);

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

    return () => {
      // Clean up when unmounting
    };
  }, [latitude, longitude]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const latNum = parseFloat(latitude);
    const lonNum = parseFloat(longitude);
    const ageNum = patientAge ? parseInt(patientAge, 10) : undefined;

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setValidationError('Pickup Latitude must be a valid number between -90 and 90.');
      return;
    }

    if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      setValidationError('Pickup Longitude must be a valid number between -180 and 180.');
      return;
    }

    if (ageNum !== undefined && (isNaN(ageNum) || ageNum < 0 || ageNum > 120)) {
      setValidationError('Patient age must be between 0 and 120 years.');
      return;
    }

    if (requirements.length === 0) {
      setValidationError('At least one resource requirement is required.');
      return;
    }

    for (const req of requirements) {
      if (req.quantity <= 0) {
        setValidationError(`Quantity for ${req.resource_type} must be greater than 0.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const createdCase = await createEmergency({
        severity,
        patient_age: ageNum,
        description: description.trim() || undefined,
        pickup_latitude: latNum,
        pickup_longitude: lonNum,
        requirements,
      });

      addToast('success', 'Emergency Incident Created', `Case ${createdCase.case_number} registered successfully in Pune.`);
      navigate(`/dispatcher`);
    } catch (err) {
      const parsed = parseApiError(err);
      setValidationError(parsed.message);
      addToast('error', 'Creation Failed', parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header Back Button */}
      <div>
        <Link
          to="/dispatcher"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dispatcher Command Center
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" /> Register New Emergency Incident
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            Pune Operations
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Enter natural-language incident notes for Gemini AI analysis or manually select a Pune location on the map.
        </p>
      </div>

      {/* GEMINI EMERGENCY ANALYZER SECTION */}
      <div className="p-5 rounded-2xl bg-white border border-teal-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-teal-900">
              Gemini AI Emergency Analyzer
            </h2>
          </div>
          <button
            type="button"
            onClick={handleUseDemoText}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-all cursor-pointer"
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
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAnalyzeWithGemini}
              disabled={aiAnalyzing || !aiInput.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-teal-600 hover:bg-teal-700 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
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

        {/* Gemini Error State */}
        {aiError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{aiError}</span>
          </div>
        )}

        {/* Gemini Success Card */}
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

            {/* Extracted Required Resources */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Extracted Resources</span>
              <div className="flex flex-wrap gap-2">
                {aiAnalysis.required_resources.map((res, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-mono font-bold text-xs"
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

      {validationError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
          ⚠️ {validationError}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        {/* Incident General Info */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
            1. Incident Profile
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Emergency Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as EmergencySeverity)}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500"
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
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Incident Description / Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="e.g. Multi-vehicle collision on highway near Deccan with respiratory distress..."
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Location Coordinates & Interactive Pune Map Picker */}
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-red-500" /> 2. Pune Pickup Location Coordinates
            </h3>
            <span className="text-[11px] text-teal-700 font-medium">
              Click map or select landmark below
            </span>
          </div>

          {/* Quick Pune Presets Buttons */}
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
                      ? 'bg-red-50 text-red-700 border border-red-200 font-bold'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          {/* Mini Interactive Map for Pinpoint Selection */}
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
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
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
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Required Resources Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              3. Required Hospital Resources
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
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
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

        {/* Submit Actions */}
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
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-teal-600 hover:bg-teal-700 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Registering Incident...
              </>
            ) : (
              'REGISTER EMERGENCY & PROCEED TO PUNE MAP'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
