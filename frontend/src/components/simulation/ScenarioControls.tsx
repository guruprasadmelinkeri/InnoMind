import React from 'react';
import { Car, HeartPulse, Wind, AlertCircle, Sliders, Play, MapPin, Plus, Minus, Check } from 'lucide-react';
import type { ResourceType } from '../../types/hospital';
import type { EmergencySeverity } from '../../types/emergency';

export interface ScenarioConfig {
  presetKey: string;
  title: string;
  description: string;
  severity: EmergencySeverity;
  patientAge: number;
  latitude: number;
  longitude: number;
  traumaRequired: boolean;
  requirements: Record<string, number>;
}

export const PRESET_SCENARIOS: ScenarioConfig[] = [
  {
    presetKey: 'road_accident',
    title: 'Road Accident',
    description: 'Collision near FC Road / Deccan Gymkhana with severe trauma and thoracic injuries.',
    severity: 'CRITICAL',
    patientAge: 42,
    latitude: 18.5204,
    longitude: 73.841,
    traumaRequired: true,
    requirements: {
      ICU_BED: 1,
      TRAUMA_BED: 1,
      VENTILATOR: 1,
    },
  },
  {
    presetKey: 'cardiac_emergency',
    title: 'Cardiac Emergency',
    description: 'Acute myocardial infarction near Swargate Chowk requiring urgent cardiac ICU.',
    severity: 'CRITICAL',
    patientAge: 64,
    latitude: 18.5018,
    longitude: 73.858,
    traumaRequired: false,
    requirements: {
      ICU_BED: 1,
      OXYGEN_BED: 1,
    },
  },
  {
    presetKey: 'respiratory_failure',
    title: 'Respiratory Failure',
    description: 'Acute respiratory distress syndrome near Shivajinagar requiring mechanical ventilation.',
    severity: 'HIGH',
    patientAge: 58,
    latitude: 18.5314,
    longitude: 73.851,
    traumaRequired: false,
    requirements: {
      VENTILATOR: 1,
      OXYGEN_BED: 1,
    },
  },
  {
    presetKey: 'mass_casualty',
    title: 'Mass Casualty Event',
    description: 'Industrial incident near Hadapsar / Magarpatta City with multiple critical casualties.',
    severity: 'CRITICAL',
    patientAge: 35,
    latitude: 18.5089,
    longitude: 73.926,
    traumaRequired: true,
    requirements: {
      TRAUMA_BED: 2,
      OPERATING_ROOM: 1,
      ICU_BED: 2,
    },
  },
];

const ALL_RESOURCE_TYPES: { type: ResourceType; label: string }[] = [
  { type: 'ICU_BED', label: 'ICU Bed' },
  { type: 'VENTILATOR', label: 'Ventilator' },
  { type: 'TRAUMA_BED', label: 'Trauma Bed' },
  { type: 'OPERATING_ROOM', label: 'Operating Room' },
  { type: 'OXYGEN_BED', label: 'Oxygen Bed' },
  { type: 'GENERAL_BED', label: 'General Bed' },
];

interface ScenarioControlsProps {
  currentScenario: ScenarioConfig;
  onSelectPreset: (preset: ScenarioConfig) => void;
  onUpdateScenario: (updated: ScenarioConfig) => void;
  onRunSimulation: () => void;
  isRunning?: boolean;
}

export const ScenarioControls: React.FC<ScenarioControlsProps> = ({
  currentScenario,
  onSelectPreset,
  onUpdateScenario,
  onRunSimulation,
  isRunning = false,
}) => {
  const getPresetIcon = (key: string) => {
    switch (key) {
      case 'road_accident':
        return <Car className="w-4 h-4 text-rose-400" />;
      case 'cardiac_emergency':
        return <HeartPulse className="w-4 h-4 text-amber-400" />;
      case 'respiratory_failure':
        return <Wind className="w-4 h-4 text-sky-400" />;
      case 'mass_casualty':
        return <AlertCircle className="w-4 h-4 text-purple-400" />;
      default:
        return <Sliders className="w-4 h-4 text-rose-400" />;
    }
  };

  const handleResourceQuantityChange = (resType: string, delta: number) => {
    const currentQty = currentScenario.requirements[resType] || 0;
    const newQty = Math.max(0, currentQty + delta);
    const newRequirements = { ...currentScenario.requirements };
    if (newQty === 0) {
      delete newRequirements[resType];
    } else {
      newRequirements[resType] = newQty;
    }
    onUpdateScenario({
      ...currentScenario,
      presetKey: 'custom',
      requirements: newRequirements,
    });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Scenario Controls</h2>
        </div>
        <span className="text-[10px] font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
          Preset & Custom
        </span>
      </div>

      {/* Realistic Preset Selector */}
      <div className="space-y-2.5">
        <label className="text-xs font-semibold text-slate-300 block">Preset Scenarios</label>
        <div className="grid grid-cols-2 gap-2">
          {PRESET_SCENARIOS.map((preset) => {
            const isSelected = currentScenario.presetKey === preset.presetKey;
            return (
              <button
                key={preset.presetKey}
                onClick={() => onSelectPreset(preset)}
                className={`flex flex-col text-left p-2.5 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'bg-rose-500/10 border-rose-500/40 text-white shadow-lg shadow-rose-500/5'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    {getPresetIcon(preset.presetKey)}
                    <span>{preset.title}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                </div>
                <span className="text-[10px] text-slate-500 line-clamp-1 mt-1">{preset.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scenario Parameters Form */}
      <div className="space-y-4 pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Severity & Patient Details</span>
          <span className="text-[11px] font-mono text-slate-400">Age: {currentScenario.patientAge} yr</span>
        </div>

        {/* Severity Selector */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as EmergencySeverity[]).map((sev) => {
            const isSelected = currentScenario.severity === sev;
            return (
              <button
                key={sev}
                type="button"
                onClick={() =>
                  onUpdateScenario({ ...currentScenario, severity: sev, presetKey: 'custom' })
                }
                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                  isSelected
                    ? sev === 'CRITICAL'
                      ? 'bg-rose-600 text-white border-rose-500'
                      : sev === 'HIGH'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-sky-600 text-white border-sky-500'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {sev}
              </button>
            );
          })}
        </div>

        {/* Required Resources Multi-Selector with Counter */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-300 block">Required Resources</span>
          <div className="space-y-1.5">
            {ALL_RESOURCE_TYPES.map(({ type, label }) => {
              const qty = currentScenario.requirements[type] || 0;
              return (
                <div
                  key={type}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs transition-colors ${
                    qty > 0
                      ? 'bg-slate-950 border-slate-700 text-white'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <span className="font-medium text-[11px]">{label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResourceQuantityChange(type, -1)}
                      className="p-1 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800 disabled:opacity-30"
                      disabled={qty === 0}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className={`w-4 text-center font-mono font-bold text-xs ${qty > 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleResourceQuantityChange(type, 1)}
                      className="p-1 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Location & Trauma Toggle */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 mb-1">
              <MapPin className="w-3 h-3 text-rose-400" /> Patient Lat/Long
            </label>
            <div className="text-[11px] font-mono text-slate-300 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 truncate">
              {currentScenario.latitude.toFixed(4)}, {currentScenario.longitude.toFixed(4)}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-400 block mb-1">Trauma Center Required</label>
            <button
              type="button"
              onClick={() =>
                onUpdateScenario({
                  ...currentScenario,
                  traumaRequired: !currentScenario.traumaRequired,
                  presetKey: 'custom',
                })
              }
              className={`w-full py-1.5 text-xs font-bold rounded-lg border transition-all ${
                currentScenario.traumaRequired
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              {currentScenario.traumaRequired ? 'YES (Required)' : 'NO (Standard)'}
            </button>
          </div>
        </div>
      </div>

      {/* Execute Simulation Action Button */}
      <button
        type="button"
        onClick={onRunSimulation}
        disabled={isRunning}
        className="w-full py-3 px-4 rounded-xl font-extrabold text-xs text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-lg shadow-rose-600/20 transition-all duration-200 transform active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Play className={`w-4 h-4 fill-current ${isRunning ? 'animate-spin' : ''}`} />
        <span>{isRunning ? 'CALCULATING ENGINE...' : 'RUN ALLOCATION SIMULATION'}</span>
      </button>
    </div>
  );
};
