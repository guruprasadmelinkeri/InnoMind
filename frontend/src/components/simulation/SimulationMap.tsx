import React from 'react';
import type { Hospital } from '../../types/hospital';
import type { HospitalRecommendation } from '../../types/allocation';
import type { ScenarioConfig } from './ScenarioControls';
import { PuneMap } from '../map/PuneMap';
import type { EmergencyPoint } from '../map/PuneMap';

interface SimulationMapProps {
  scenario: ScenarioConfig;
  hospitals: Hospital[];
  recommendations: HospitalRecommendation[];
  selectedHospitalId: number | null;
  onSelectHospitalNode: (hospitalId: number) => void;
  isLoading?: boolean;
}

export const SimulationMap: React.FC<SimulationMapProps> = ({
  scenario,
  hospitals,
  recommendations,
  selectedHospitalId,
  onSelectHospitalNode,
  isLoading = false,
}) => {
  const emergencyPoint: EmergencyPoint = {
    latitude: scenario.latitude,
    longitude: scenario.longitude,
    label: `Simulation Scenario: ${scenario.title}`,
  };

  return (
    <div className="relative w-full">
      <PuneMap
        hospitals={hospitals}
        emergencyPoint={emergencyPoint}
        selectedHospitalId={selectedHospitalId}
        onSelectHospital={onSelectHospitalNode}
        recommendations={recommendations}
        height="480px"
      />

      {isLoading && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-xs z-[550] flex flex-col items-center justify-center gap-2 rounded-2xl">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-teal-800">Recalculating Deterministic Engine...</span>
        </div>
      )}
    </div>
  );
};
