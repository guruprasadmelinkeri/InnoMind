import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Plus, Trash2, MapPin, Loader2 } from 'lucide-react';
import { createEmergency } from '../../services/emergencyApi';
import type { EmergencySeverity, EmergencyRequirementCreate } from '../../types/emergency';
import type { ResourceType } from '../../types/hospital';
import { useToast } from '../../components/common/Toast';
import { parseApiError } from '../../services/api';

const RESOURCE_TYPES: { type: ResourceType; label: string }[] = [
  { type: 'ICU_BED', label: 'ICU Bed' },
  { type: 'GENERAL_BED', label: 'General Bed' },
  { type: 'VENTILATOR', label: 'Ventilator' },
  { type: 'OXYGEN_BED', label: 'Oxygen Bed' },
  { type: 'TRAUMA_BED', label: 'Trauma Bed' },
  { type: 'OPERATING_ROOM', label: 'Operating Room' },
];

export const CreateEmergencyPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [severity, setSeverity] = useState<EmergencySeverity>('CRITICAL');
  const [patientAge, setPatientAge] = useState<string>('45');
  const [description, setDescription] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('37.774900');
  const [longitude, setLongitude] = useState<string>('-122.419400');

  const [requirements, setRequirements] = useState<EmergencyRequirementCreate[]>([
    { resource_type: 'ICU_BED', quantity: 1, required: true },
    { resource_type: 'VENTILATOR', quantity: 1, required: true },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleAddRequirement = () => {
    // Find unselected resource type
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

    // Frontend Validations
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

      addToast('success', 'Emergency Incident Created', `Case ${createdCase.case_number} registered successfully.`);
      navigate(`/dispatcher/emergency/${createdCase.id}`);
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
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dispatcher Command Center
        </Link>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <ShieldAlert className="w-7 h-7 text-rose-500" /> Register New Emergency Incident
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Specify patient condition, pickup coordinates, and required hospital resources.
        </p>
      </div>

      {validationError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
          ⚠️ {validationError}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl backdrop-blur-md">
        {/* Incident General Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400 border-b border-slate-800 pb-2">
            1. Incident Profile
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Emergency Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as EmergencySeverity)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-semibold focus:outline-none focus:border-rose-500"
              >
                <option value="CRITICAL">CRITICAL (Life-threatening / Severe Trauma)</option>
                <option value="HIGH">HIGH (Urgent medical intervention needed)</option>
                <option value="MODERATE">MODERATE (Stable but requires care)</option>
                <option value="LOW">LOW (Non-critical emergency)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Patient Age (Years)</label>
              <input
                type="number"
                min="0"
                max="120"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
                placeholder="e.g. 45"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Incident Description / Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Multi-vehicle collision on Highway 101 with severe respiratory distress..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>

        {/* Location Coordinates */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400 border-b border-slate-800 pb-2 flex items-center gap-1.5">
            <MapPin className="w-4 h-4" /> 2. Pickup Location Coordinates
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Pickup Latitude (-90 to 90)</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Pickup Longitude (-180 to 180)</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* Required Resources Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400">
              3. Required Hospital Resources
            </h3>
            <button
              type="button"
              onClick={handleAddRequirement}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Resource
            </button>
          </div>

          <div className="space-y-3">
            {requirements.map((req, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800"
              >
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] uppercase font-semibold text-slate-400">Resource Type</label>
                  <select
                    value={req.resource_type}
                    onChange={(e) => handleRequirementChange(index, 'resource_type', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-semibold focus:outline-none"
                  >
                    {RESOURCE_TYPES.map((rt) => (
                      <option key={rt.type} value={rt.type}>
                        {rt.label} ({rt.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-32 space-y-1">
                  <label className="text-[10px] uppercase font-semibold text-slate-400">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={req.quantity}
                    onChange={(e) =>
                      handleRequirementChange(index, 'quantity', parseInt(e.target.value, 10) || 1)
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-mono text-center focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-4 sm:pt-6">
                  <label className="flex items-center gap-2 text-xs text-slate-300 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={req.required}
                      onChange={(e) => handleRequirementChange(index, 'required', e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    Mandatory
                  </label>

                  <button
                    type="button"
                    onClick={() => handleRemoveRequirement(index)}
                    className="p-2 text-slate-500 hover:text-rose-400 rounded-xl transition-colors ml-auto"
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
        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
          <Link
            to="/dispatcher"
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-xl shadow-rose-600/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Registering Incident...
              </>
            ) : (
              'REGISTER EMERGENCY & FIND HOSPITALS'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
