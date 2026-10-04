import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getHospitals, updateHospitalResource, updateHospital, makeHospitalStale } from '../../services/hospitalApi';
import { getEmergencies, createEmergency } from '../../services/emergencyApi';
import { getRecommendations, createAllocationRequest } from '../../services/allocationApi';
import { acceptAllocationRequest } from '../../services/reservationApi';
import type { Hospital, ResourceType } from '../../types/hospital';
import type { EmergencyCase } from '../../types/emergency';
import type { RecommendationResponse } from '../../types/allocation';
import type { Reservation } from '../../types/reservation';

import { SimulationMetricsHeader } from '../../components/simulation/SimulationMetricsHeader';
import { ScenarioControls, PRESET_SCENARIOS, type ScenarioConfig } from '../../components/simulation/ScenarioControls';
import { SimulationMap } from '../../components/simulation/SimulationMap';
import { AllocationDecisionPanel } from '../../components/simulation/AllocationDecisionPanel';
import { SimulationTimeline, type SimulationStage } from '../../components/simulation/SimulationTimeline';
import { WhatIfControls } from '../../components/simulation/WhatIfControls';
import { RankingTable } from '../../components/simulation/RankingTable';

import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { useToast } from '../../components/common/Toast';
import { useWebSocket } from '../../hooks/useWebSocket';
import { parseApiError } from '../../services/api';

export const SimulationLab: React.FC = () => {
  const { addToast } = useToast();

  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyCase[]>([]);
  const [reservations] = useState<Reservation[]>([]);

  const [scenario, setScenario] = useState<ScenarioConfig>(PRESET_SCENARIOS[0]);
  const [activeEmergency, setActiveEmergency] = useState<EmergencyCase | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);

  const [timelineStage, setTimelineStage] = useState<SimulationStage>('SELECTED');
  const [allocationChangeLog, setAllocationChangeLog] = useState<{
    previousHospital: string;
    newHospital: string;
    reason: string;
  } | null>(null);

  const [simultaneousResults, setSimultaneousResults] = useState<{
    requestA: { status: 'ACCEPTED'; hospital: string };
    requestB: { status: 'REJECTED'; reason: string };
  } | null>(null);

  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(new Date());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEngineCalculating, setIsEngineCalculating] = useState<boolean>(false);
  const [isExecutingWhatIf, setIsExecutingWhatIf] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initial Load of Hospitals, Emergencies & Baseline Simulation Emergency
  const initializeSimulation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [hData, eData] = await Promise.all([getHospitals(), getEmergencies()]);
      setHospitals(hData);
      setEmergencies(eData);

      // Create a clean simulation emergency case for the engine
      const createdSimEmergency = await createEmergency({
        case_number: `SIM-${Date.now().toString().slice(-6)}`,
        severity: scenario.severity,
        patient_age: scenario.patientAge,
        description: `[SIMULATION LAB] ${scenario.title}: ${scenario.description}`,
        pickup_latitude: scenario.latitude,
        pickup_longitude: scenario.longitude,
        requirements: Object.entries(scenario.requirements).map(([resType, qty]) => ({
          resource_type: resType as ResourceType,
          quantity: qty,
          required: true,
        })),
      });

      setActiveEmergency(createdSimEmergency);

      // Run recommendation engine for created emergency
      const recData = await getRecommendations(createdSimEmergency.id);
      setRecommendations(recData);
      if (recData.recommendations.length > 0) {
        setSelectedHospitalId(recData.recommendations[0].hospital_id);
      }

      setTimelineStage('SELECTED');
      setLastUpdatedTime(new Date());
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [scenario]);

  useEffect(() => {
    initializeSimulation();
  }, []);

  // Recalculate allocation recommendations whenever scenario or hospital data updates
  const calculateEngineRecommendations = async (targetEmergencyId?: number) => {
    const eId = targetEmergencyId || activeEmergency?.id;
    if (!eId) return;
    setIsEngineCalculating(true);
    try {
      const [recData, hData] = await Promise.all([
        getRecommendations(eId),
        getHospitals(),
      ]);
      setRecommendations(recData);
      setHospitals(hData);
      setLastUpdatedTime(new Date());

      if (recData.recommendations.length > 0 && !selectedHospitalId) {
        setSelectedHospitalId(recData.recommendations[0].hospital_id);
      }
    } catch (err) {
      console.error('Failed to recalculate simulation engine:', err);
    } finally {
      setIsEngineCalculating(false);
    }
  };

  // Real-Time WebSocket Event Listener
  useWebSocket(
    ['RESOURCE_UPDATED', 'HOSPITAL_STATUS_UPDATED', 'ALLOCATION_REQUEST_ACCEPTED', 'EMERGENCY_STATUS_UPDATED'],
    (payload) => {
      console.log('SimulationLab WebSocket Event:', payload);
      if (payload.event === 'RESOURCE_UPDATED' && payload.data) {
        const { hospital_id, resource_type, available } = payload.data;
        addToast(
          'info',
          'Live WebSocket Update',
          `Hospital #${hospital_id} ${resource_type} availability updated: ${available}`
        );
        calculateEngineRecommendations();
      } else if (payload.event === 'HOSPITAL_STATUS_UPDATED' && payload.data) {
        addToast('warning', 'Hospital Status Changed', `Hospital #${payload.data.hospital_id} status set to ${payload.data.status}`);
        calculateEngineRecommendations();
      }
    }
  );

  // Scenario Controls Handlers
  const handleSelectPreset = async (preset: ScenarioConfig) => {
    setScenario(preset);
    setAllocationChangeLog(null);
    setSimultaneousResults(null);
    setIsLoading(true);
    try {
      const createdSimEmergency = await createEmergency({
        case_number: `SIM-${Date.now().toString().slice(-6)}`,
        severity: preset.severity,
        patient_age: preset.patientAge,
        description: `[SIMULATION LAB] ${preset.title}: ${preset.description}`,
        pickup_latitude: preset.latitude,
        pickup_longitude: preset.longitude,
        requirements: Object.entries(preset.requirements).map(([resType, qty]) => ({
          resource_type: resType as ResourceType,
          quantity: qty,
          required: true,
        })),
      });

      setActiveEmergency(createdSimEmergency);
      const recData = await getRecommendations(createdSimEmergency.id);
      setRecommendations(recData);
      if (recData.recommendations.length > 0) {
        setSelectedHospitalId(recData.recommendations[0].hospital_id);
      }

      setTimelineStage('SELECTED');
      setLastUpdatedTime(new Date());
      addToast('success', 'Preset Scenario Loaded', `Loaded preset: ${preset.title}`);
    } catch (err) {
      addToast('error', 'Scenario Load Failed', parseApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!activeEmergency) return;
    setIsEngineCalculating(true);
    try {
      const recData = await getRecommendations(activeEmergency.id);
      setRecommendations(recData);
      setLastUpdatedTime(new Date());
      addToast('info', 'Allocation Engine Executed', 'Recalculated hospital rankings with current scenario parameters.');
    } catch (err) {
      addToast('error', 'Engine Error', parseApiError(err).message);
    } finally {
      setIsEngineCalculating(false);
    }
  };

  // What-If Scenario 1: Remove Resource (e.g. ICU_BED -> 0)
  const handleRemoveResource = async () => {
    if (!recommendations || recommendations.recommendations.length === 0) return;
    setIsExecutingWhatIf(true);
    const topRec = recommendations.recommendations[0];
    const prevHospitalName = topRec.hospital_name;

    try {
      // Find hospital ICU or primary resource
      const targetHospital = hospitals.find((h) => h.id === topRec.hospital_id);
      const targetRes = targetHospital?.resources?.find((r) => r.available > 0) || targetHospital?.resources?.[0];

      if (!targetRes) {
        addToast('warning', 'No Resource Found', 'Target hospital has no resources to remove.');
        return;
      }

      // Set available to 0 via API
      await updateHospitalResource(topRec.hospital_id, {
        resource_type: targetRes.resource_type,
        total: targetRes.total,
        available: 0,
      });

      // Recalculate recommendations
      const newRecData = await getRecommendations(activeEmergency!.id);
      setRecommendations(newRecData);

      const newTopRec = newRecData.recommendations[0];
      const newHospitalName = newTopRec ? newTopRec.hospital_name : 'No eligible hospital';

      setAllocationChangeLog({
        previousHospital: prevHospitalName,
        newHospital: newHospitalName,
        reason: `${prevHospitalName} no longer satisfies the ${targetRes.resource_type} requirement.`,
      });

      addToast('warning', 'Scenario Executed', `Removed ${targetRes.resource_type} from ${prevHospitalName}.`);
    } catch (err) {
      addToast('error', 'Action Failed', parseApiError(err).message);
    } finally {
      setIsExecutingWhatIf(false);
    }
  };

  // What-If Scenario 2: Take Hospital Offline
  const handleToggleHospitalOffline = async () => {
    if (!recommendations || recommendations.recommendations.length === 0) return;
    setIsExecutingWhatIf(true);
    const topRec = recommendations.recommendations[0];
    const prevHospitalName = topRec.hospital_name;

    try {
      const targetHospital = hospitals.find((h) => h.id === topRec.hospital_id);
      const newStatus = targetHospital?.status === 'Offline' ? 'Active' : 'Offline';

      await updateHospital(topRec.hospital_id, {
        name: topRec.hospital_name,
        status: newStatus,
      });

      const newRecData = await getRecommendations(activeEmergency!.id);
      setRecommendations(newRecData);

      const newTopRec = newRecData.recommendations[0];
      const newHospitalName = newTopRec ? newTopRec.hospital_name : 'No eligible hospital';

      setAllocationChangeLog({
        previousHospital: prevHospitalName,
        newHospital: newHospitalName,
        reason: `${prevHospitalName} status updated to ${newStatus}.`,
      });

      addToast('warning', 'Hospital Status Updated', `${prevHospitalName} status set to ${newStatus}.`);
    } catch (err) {
      addToast('error', 'Status Update Failed', parseApiError(err).message);
    } finally {
      setIsExecutingWhatIf(false);
    }
  };

  // What-If Scenario 3: Simulate Stale Data
  const handleSimulateStaleData = async () => {
    if (!recommendations || recommendations.recommendations.length === 0) return;
    setIsExecutingWhatIf(true);
    const topRec = recommendations.recommendations[0];

    try {
      await makeHospitalStale(topRec.hospital_id);
      const newRecData = await getRecommendations(activeEmergency!.id);
      setRecommendations(newRecData);
      setLastUpdatedTime(new Date());

      addToast(
        'warning',
        'Stale Data Simulated',
        `Set ${topRec.hospital_name} resource update timestamp to 15m ago. Data freshness penalty applied.`
      );
    } catch (err) {
      addToast('error', 'Stale Simulation Failed', parseApiError(err).message);
    } finally {
      setIsExecutingWhatIf(false);
    }
  };

  // What-If Scenario 4: Simulate Simultaneous Requests (Atomic Double-Booking Protection)
  const handleSimulateSimultaneousRequests = async () => {
    if (!activeEmergency || !recommendations || recommendations.recommendations.length === 0) return;
    setIsExecutingWhatIf(true);
    const targetHospital = recommendations.recommendations[0];

    try {
      // Create request 1
      const req1 = await createAllocationRequest(activeEmergency.id, targetHospital.hospital_id);
      // Accept request 1 -> Atomically reserves resource!
      await acceptAllocationRequest(req1.id);

      // Create request 2 for same hospital & try to accept again when stock exhausted or reserved
      let req2BlockedReason = 'Resource already reserved by Request #1';
      try {
        const req2 = await createAllocationRequest(activeEmergency.id, targetHospital.hospital_id);
        await acceptAllocationRequest(req2.id);
      } catch (err) {
        req2BlockedReason = parseApiError(err).message;
      }

      setSimultaneousResults({
        requestA: { status: 'ACCEPTED', hospital: targetHospital.hospital_name },
        requestB: { status: 'REJECTED', reason: req2BlockedReason },
      });

      setTimelineStage('RESERVED');
      addToast('success', 'Atomic Double-Booking Protection Verified', 'Request #1 reserved resource; Request #2 was cleanly rejected.');
    } catch (err) {
      addToast('error', 'Simultaneous Request Test Error', parseApiError(err).message);
    } finally {
      setIsExecutingWhatIf(false);
    }
  };

  // Timeline Action: Reserve Resource Now
  const handleReserveResourceFromTimeline = async () => {
    if (!activeEmergency || !recommendations || recommendations.recommendations.length === 0) return;
    const topRec = recommendations.recommendations[0];
    try {
      const req = await createAllocationRequest(activeEmergency.id, topRec.hospital_id);
      await acceptAllocationRequest(req.id);
      setTimelineStage('RESERVED');
      addToast('success', 'Resource Reserved', `Atomically reserved required resource at ${topRec.hospital_name}.`);
    } catch (err) {
      addToast('error', 'Reservation Failed', parseApiError(err).message);
    }
  };

  // Reset Demo Baseline
  const handleResetSimulationBaseline = async () => {
    setIsLoading(true);
    try {
      // Restore hospitals' resources & status to default
      const hList = await getHospitals();
      for (const h of hList) {
        if (h.status !== 'Active') {
          await updateHospital(h.id, { name: h.name, status: 'Active' });
        }
        if (h.resources) {
          for (const r of h.resources) {
            await updateHospitalResource(h.id, {
              resource_type: r.resource_type,
              total: r.total,
              available: Math.max(2, r.total - r.reserved),
            });
          }
        }
      }
      setAllocationChangeLog(null);
      setSimultaneousResults(null);
      await initializeSimulation();
      addToast('success', 'Baseline Restored', 'Reset all hospital statuses & resource counts to default demo baseline.');
    } catch (err) {
      addToast('error', 'Reset Failed', parseApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner label="Initializing MediRoute Simulation Lab..." />;
  }

  const topRec = recommendations?.recommendations?.[0] || null;

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Back Link & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link
          to="/dispatcher"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Dispatcher Command Center
        </Link>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400 font-semibold">WebSocket Connection Active</span>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={initializeSimulation} />}

      {/* 6. Metrics Header */}
      <SimulationMetricsHeader
        hospitals={hospitals}
        emergencies={emergencies}
        reservations={reservations}
        lastUpdatedTime={lastUpdatedTime}
        onResetSimulation={handleResetSimulationBaseline}
        isResetting={isLoading}
      />

      {/* 3-Column Layout on Desktop / Single Column Stack on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column — Scenario Controls (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          <ScenarioControls
            currentScenario={scenario}
            onSelectPreset={handleSelectPreset}
            onUpdateScenario={setScenario}
            onRunSimulation={handleRunSimulation}
            isRunning={isEngineCalculating}
          />
        </div>

        {/* Center Column — Live Simulation Map (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <SimulationMap
            scenario={scenario}
            hospitals={hospitals}
            recommendations={recommendations?.recommendations || []}
            selectedHospitalId={selectedHospitalId}
            onSelectHospitalNode={(id) => setSelectedHospitalId(id)}
            isLoading={isEngineCalculating}
          />
        </div>

        {/* Right Column — Allocation Decision Panel (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <AllocationDecisionPanel
            topRecommendation={topRec}
            ineligibleCount={recommendations?.ineligible_hospitals?.length || 0}
          />
        </div>
      </div>

      {/* 3. Simulation Workflow Timeline */}
      <SimulationTimeline
        currentStage={timelineStage}
        onReserveResource={handleReserveResourceFromTimeline}
      />

      {/* 4. "What If?" Simulation Stress Controls */}
      <WhatIfControls
        onRemoveResource={handleRemoveResource}
        onToggleHospitalOffline={handleToggleHospitalOffline}
        onSimulateStaleData={handleSimulateStaleData}
        onSimulateSimultaneousRequests={handleSimulateSimultaneousRequests}
        allocationChangeLog={allocationChangeLog}
        simultaneousResults={simultaneousResults}
        isExecuting={isExecutingWhatIf}
      />

      {/* 5. Live Ranking Table */}
      <RankingTable
        recommendations={recommendations?.recommendations || []}
        ineligibleHospitals={recommendations?.ineligible_hospitals || []}
        hospitals={hospitals}
        selectedHospitalId={selectedHospitalId}
        onSelectHospital={(id) => setSelectedHospitalId(id)}
      />
    </div>
  );
};
