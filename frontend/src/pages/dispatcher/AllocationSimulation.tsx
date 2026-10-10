import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Activity,
  Zap,
  Award,
  CheckCircle2,
  RefreshCw,
  Bot,
  ArrowLeft,
  Truck,
  Compass,
  CircleAlert,
  CircleHelp,
  Info
} from 'lucide-react';
import { getEmergencies, createEmergency, updateEmergencyStatus } from '../../services/emergencyApi';
import { getHospitals, updateHospital, updateHospitalResource } from '../../services/hospitalApi';
import { createAllocationRequest, getEmergencyRequests } from '../../services/allocationApi';
import { acceptAllocationRequest, rejectAllocationRequest } from '../../services/reservationApi';
import { performBatchAllocation } from '../../services/batchAllocationApi'; // We'll create this service
import type { Hospital, ResourceType } from '../../types/hospital';
import type { EmergencyCase, EmergencyCaseCreate, EmergencySeverity } from '../../types/emergency';
import type { BatchAllocationResult } from '../../types/allocation';

import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { useToast } from '../../components/common/Toast';
import { useWebSocket } from '../../hooks/useWebSocket';
import { parseApiError } from '../../services/api';

export const AllocationSimulation: React.FC = () => {
  const { addToast } = useToast();

  // Simulation state
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyCase[]>([]);
  const [simulationEmergencies, setSimulationEmergencies] = useState<EmergencyCase[]>([]);
  const [batchResults, setBatchResults] = useState<BatchAllocationResult | null>(null);
  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Replanning timeline state
  const [timelineEvents, setTimelineEvents] = useState<Array<{
    id: string;
    timestamp: string;
    type: string;
    title: string;
    description: string;
    emergencyId?: number;
    hospitalId?: number;
    outcome: string;
  }>>([]);

  // Track which hospitals have been modified in simulation
  const [originalHospitalResources, setOriginalHospitalResources] = useState<Map<number, Map<ResourceType, { available: number; total: number }>>>(new Map());
  const [originalHospitalLocations, setOriginalHospitalLocations] = useState<Map<number, { latitude: number; longitude: number }>>(new Map());
  const [modifiedHospitals, setModifiedHospitals] = useState<Set<number>>(new Set());

  // WebSocket connection for real-time updates
  useWebSocket(
    [
      'RESOURCE_UPDATED',
      'HOSPITAL_STATUS_UPDATED',
      'ALLOCATION_REQUEST_ACCEPTED',
      'ALLOCATION_REQUEST_REJECTED',
      'RESERVATION_CREATED',
      'EMERGENCY_STATUS_UPDATED',
      'AUTOMATION_INTERVENTION_REQUIRED'
    ],
    (payload) => {
      console.log('AllocationSimulation WebSocket Event:', payload);
      handleWebSocketEvent(payload);
    }
  );

  // Initialize simulation
  const initializeSimulation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Load current state
      const [hData, eData] = await Promise.all([
        getHospitals(),
        getEmergencies()
      ]);

      setHospitals(hData);
      setEmergencies(eData);

      // Store original hospital resources for reset functionality
      const originalResources = new Map<number, Map<ResourceType, { available: number; total: number }>>();
      hData.forEach(hospital => {
        const resourcesMap = new Map<ResourceType, { available: number; total: number }>();
        hospital.resources.forEach(resource => {
          resourcesMap.set(resource.resource_type, {
            available: resource.available,
            total: resource.total
          });
        });
        originalResources.set(hospital.id, resourcesMap);
      });
      setOriginalHospitalResources(originalResources);
      setOriginalHospitalLocations(new Map(hData
        .filter(hospital => hospital.latitude !== undefined && hospital.latitude !== null && hospital.longitude !== undefined && hospital.longitude !== null)
        .map(hospital => [hospital.id, { latitude: hospital.latitude!, longitude: hospital.longitude! }])));

      // Clear any existing simulation data
      setSimulationEmergencies([]);
      setBatchResults(null);
      setTimelineEvents([]);
      setModifiedHospitals(new Set());

    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle WebSocket events to update simulation state
  const handleWebSocketEvent = (payload: any) => {
    if (payload.event === 'RESOURCE_UPDATED' && payload.data) {
      const { hospital_id, resource_type, available, reserved, total } = payload.data;
      // Update hospital resources in state
      setHospitals(prev => prev.map(hospital => {
        if (hospital.id === hospital_id) {
          const updatedResources = hospital.resources.map(resource => {
            if (resource.resource_type === resource_type) {
              return { ...resource, available, reserved, total };
            }
            return resource;
          });
          return { ...hospital, resources: updatedResources };
        }
        return hospital;
      }));

      // Add to timeline
      addTimelineEvent(
        'resource_update',
        'Resource Availability Changed',
        `Hospital resource updated: ${available} available`,
        undefined,
        hospital_id
      );
    } else if (payload.event === 'ALLOCATION_REQUEST_ACCEPTED' && payload.data) {
      const { emergency_id, hospital_id } = payload.data;
      addTimelineEvent(
        'allocation_accepted',
        'Allocation Request Accepted',
        `Hospital accepted allocation request for emergency #${emergency_id}`,
        emergency_id,
        hospital_id,
        'ACCEPTED'
      );
    } else if (payload.event === 'ALLOCATION_REQUEST_REJECTED' && payload.data) {
      const { emergency_id, hospital_id, rejection_reason } = payload.data;
      addTimelineEvent(
        'allocation_rejected',
        'Allocation Request Rejected',
        `Hospital rejected allocation request: ${rejection_reason || 'No reason provided'}`,
        emergency_id,
        hospital_id,
        'REJECTED'
      );
    } else if (payload.event === 'RESERVATION_CREATED' && payload.data) {
      const { emergency_id, hospital_id } = payload.data;
      addTimelineEvent(
        'reservation_created',
        'Resources Reserved',
        `Resources reserved at hospital for emergency #${emergency_id}`,
        emergency_id,
        hospital_id,
        'RESERVED'
      );
    } else if (payload.event === 'EMERGENCY_STATUS_UPDATED' && payload.data) {
      const { emergency_id, status } = payload.data;
      addTimelineEvent(
        'emergency_status_updated',
        'Emergency Status Changed',
        `Emergency #${emergency_id} status changed to ${status}`,
        emergency_id,
        undefined,
        status.toString()
      );
    } else if (payload.event === 'AUTOMATION_INTERVENTION_REQUIRED' && payload.data) {
      const { message } = payload.data;
      addTimelineEvent(
        'intervention_required',
        'Manual Intervention Required',
        message || 'Automation requires dispatcher override',
        undefined,
        undefined,
        'INTERVENTION_REQUIRED'
      );
    }
  };

  // Add event to timeline
  const addTimelineEvent = useCallback((
    type: string,
    title: string,
    description: string,
    emergencyId: number | undefined,
    hospitalId: number | undefined,
    outcome: string = 'INFO'
  ) => {
    const event: typeof timelineEvents[0] = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      title,
      description,
      emergencyId,
      hospitalId,
      outcome
    };

    setTimelineEvents(prev => [...prev, event]);

    // Keep only last 50 events to prevent performance issues
    if (timelineEvents.length >= 50) {
      setTimelineEvents(prev => prev.slice(-50));
    }
  }, [timelineEvents]);

  // Load simulation emergencies (those with SIM- prefix)
  useEffect(() => {
    const loadSimulationEmergencies = async () => {
      try {
        const simEmergencies = emergencies.filter(e =>
          e.case_number && e.case_number.startsWith('SIM-')
        );
        setSimulationEmergencies(simEmergencies);
      } catch (err) {
        console.error('Failed to load simulation emergencies:', err);
      }
    };

    if (emergencies.length > 0) {
      loadSimulationEmergencies();
    }
  }, [emergencies]);

  // Initialize on mount
  useEffect(() => {
    initializeSimulation();
  }, [initializeSimulation]);

  // Reset simulation to original state
  const resetSimulation = useCallback(async () => {
    setIsLoading(true);
    try {
      // Restore hospitals to original state
      if (originalHospitalResources.size > 0) {
        const hospitalUpdates = Array.from(originalHospitalResources.entries()).map(async ([hospitalId, resourcesMap]) => {
          const hospital = hospitals.find(h => h.id === hospitalId);
          if (hospital) {
            // Update via API
            await Promise.all(
              hospital.resources.map(async resource => {
                const original = resourcesMap.get(resource.resource_type);
                if (original) {
                  const total = Math.max(original.total, resource.reserved + resource.buffer);
                  await updateHospitalResource(hospitalId, {
                    resource_type: resource.resource_type,
                    total,
                    available: Math.min(original.available, Math.max(0, total - resource.reserved - resource.buffer)),
                    reserved: resource.reserved, // Keep current reserved count
                    buffer: resource.buffer
                  });
                }
              })
            );
          }
        });

        await Promise.all(hospitalUpdates);
      }

      // Clear simulation data
      setSimulationEmergencies([]);
      setBatchResults(null);
      setTimelineEvents([]);
      setModifiedHospitals(new Set());

      await Promise.all(Array.from(originalHospitalLocations.entries()).map(async ([hospitalId, location]) => {
        const hospital = hospitals.find(item => item.id === hospitalId);
        if (hospital) {
          await updateHospital(hospitalId, {
            name: hospital.name,
            latitude: location.latitude,
            longitude: location.longitude,
          });
        }
      }));

      // Reload the restored resources, locations, and simulation cases.
      const [hData, eData] = await Promise.all([getHospitals(), getEmergencies()]);
      setHospitals(hData);
      setEmergencies(eData);

      const originalResources = new Map<number, Map<ResourceType, { available: number; total: number }>>();
      hData.forEach(hospital => {
        const resourcesMap = new Map<ResourceType, { available: number; total: number }>();
        hospital.resources.forEach(resource => {
          resourcesMap.set(resource.resource_type, {
            available: resource.available,
            total: resource.total
          });
        });
        originalResources.set(hospital.id, resourcesMap);
      });
      setOriginalHospitalResources(originalResources);

      addToast('success', 'Simulation Reset', 'All simulation data has been reset to original state');
    } catch (err) {
      setError(parseApiError(err).message);
      addToast('error', 'Reset Failed', 'Failed to reset simulation');
    } finally {
      setIsLoading(false);
    }
  }, [hospitals, originalHospitalResources, originalHospitalLocations]);

  // Create simulation emergencies
  const createSimulationEmergencies = useCallback(async (
    count: number,
    severity: EmergencySeverity = 'HIGH',
    requiredResource?: ResourceType
  ) => {
    setIsLoading(true);
    try {
      const newEmergencies: EmergencyCase[] = [];

      for (let i = 0; i < count; i++) {
        const emergencyData: EmergencyCaseCreate = {
          case_number: `SIM-${Date.now().toString().slice(-6)}-${i}`,
          severity,
          patient_age: Math.floor(Math.random() * 80) + 20, // Random age 20-100
          description: `[SIMULATION] Emergency ${i+1} - ${severity} priority`,
          pickup_latitude: 18.5204 + (Math.random() - 0.5) * 0.1, // Random around Pune center
          pickup_longitude: 73.8410 + (Math.random() - 0.5) * 0.1,
          requirements: [
            {
              resource_type: requiredResource ?? (Math.random() > 0.5 ? 'ICU_BED' : 'VENTILATOR') as ResourceType,
              quantity: 1,
              required: true
            },
            // Sometimes add both resources for more complex scenarios
            ...(!requiredResource && Math.random() > 0.7 ? [{
              resource_type: (Math.random() > 0.5 ? 'ICU_BED' : 'VENTILATOR') as ResourceType,
              quantity: 1,
              required: true
            }] : [])
          ]
        };

        const emergency = await createEmergency(emergencyData);
        newEmergencies.push(emergency);
      }

      // Update state
      setEmergencies(prev => [...prev, ...newEmergencies]);
      setSimulationEmergencies(prev => [...prev, ...newEmergencies]);

      addToast('success', 'Emergencies Created', `Created ${count} new simulation emergencies`);

      return newEmergencies;
    } catch (err) {
      setError(parseApiError(err).message);
      addToast('error', 'Creation Failed', 'Failed to create simulation emergencies');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Run batch allocation on simulation emergencies
  const runBatchAllocation = useCallback(async (additionalEmergencyIds: number[] = []) => {
    if (simulationEmergencies.length === 0 && additionalEmergencyIds.length === 0) {
      addToast('warning', 'No Emergencies', 'Please create simulation emergencies first');
      return;
    }

    setIsRunningBatch(true);
    setError(null);

    try {
      // Clear previous results
      setBatchResults(null);
      const emergencyIds = Array.from(new Set([
        ...simulationEmergencies.map(e => e.id),
        ...additionalEmergencyIds,
      ]));
      setTimelineEvents(prev => [...prev, {
        id: `batch_start-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'batch_start',
        title: 'Batch Allocation Started',
        description: `Beginning batch allocation for ${emergencyIds.length} emergencies`,
        outcome: 'INFO'
      }]);

      // Add timeline event for batch start
      addTimelineEvent(
        'batch_start',
        'Batch Allocation Started',
        `Beginning batch allocation for ${emergencyIds.length} emergencies`,
        undefined,
        undefined,
        'INFO'
      );

      // Run batch allocation
      const result = await performBatchAllocation(emergencyIds);

      // Create a pending hospital request for each proposed assignment so the
      // rejection and acceptance scenarios exercise the real reservation flow.
      for (const assignment of result.results) {
        let requests = await getEmergencyRequests(assignment.emergency_id);
        if (assignment.status !== 'ASSIGNED' || assignment.assigned_hospital_id === null) {
          for (const pendingRequest of requests.filter(request => request.status === 'PENDING')) {
            await rejectAllocationRequest(pendingRequest.id, 'Request withdrawn because the batch is currently unserved.');
          }
          continue;
        }

        for (const staleRequest of requests.filter(request =>
          request.status === 'PENDING' && request.hospital_id !== assignment.assigned_hospital_id
        )) {
          await rejectAllocationRequest(staleRequest.id, 'Request withdrawn because replanning selected a different hospital.');
          addTimelineEvent(
            'request_cancelled',
            'Previous Request Withdrawn',
            `Pending request #${staleRequest.id} was withdrawn after conditions changed and the batch selected another hospital.`,
            assignment.emergency_id,
            staleRequest.hospital_id,
            'INFO'
          );
        }
        requests = await getEmergencyRequests(assignment.emergency_id);
        let matchingRequest = requests.find(request =>
          request.hospital_id === assignment.assigned_hospital_id &&
          (request.status === 'PENDING' || request.status === 'ACCEPTED')
        );
        if (!matchingRequest) {
          try {
            matchingRequest = await createAllocationRequest(assignment.emergency_id, assignment.assigned_hospital_id);
          } catch (requestError) {
            // Automation may have accepted a request between planning and this
            // check. Re-read once before surfacing a genuine request failure.
            requests = await getEmergencyRequests(assignment.emergency_id);
            matchingRequest = requests.find(request =>
              request.hospital_id === assignment.assigned_hospital_id &&
              (request.status === 'PENDING' || request.status === 'ACCEPTED')
            );
            if (!matchingRequest) throw requestError;
          }
        }
        assignment.request_status = matchingRequest?.status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING';
      }
      setBatchResults(result);

      // Add timeline events for each result
      result.results.forEach(res => {
        if (res.status === 'ASSIGNED') {
          addTimelineEvent(
            'allocation_assigned',
            'Emergency Assigned',
            res.explanation,
            res.emergency_id,
            res.assigned_hospital_id ?? undefined,
            'ASSIGNED'
          );
        } else {
          addTimelineEvent(
            'allocation_unserved',
            'Emergency Unserved',
            res.explanation,
            res.emergency_id,
            undefined,
            'UNSERVED'
          );
        }
      });

      // Add timeline event for batch completion
      addTimelineEvent(
        'batch_complete',
        'Batch Allocation Completed',
        `Processed ${result.summary.total} emergencies: ${result.summary.assigned} assigned, ${result.summary.unserved} unserved`,
        undefined,
        undefined,
        'INFO'
      );

      addToast('success', 'Batch Allocation Complete',
        `Processed ${result.summary.total} emergencies: ${result.summary.assigned} assigned, ${result.summary.unserved} unserved`);
    } catch (err) {
      setError(parseApiError(err).message);
      addToast('error', 'Batch Allocation Failed', 'Failed to run batch allocation');
    } finally {
      setIsRunningBatch(false);
    }
  }, [simulationEmergencies, addToast, addTimelineEvent]);

  // Scenario: Patient Surge
  const handlePatientSurge = useCallback(async () => {
    try {
      await createSimulationEmergencies(5, 'HIGH'); // Create 5 high priority emergencies
      addToast('info', 'Patient Surge Initiated', 'Created 5 high-priority emergency requests');
    } catch (err) {
      addToast('error', 'Patient Surge Failed', 'Failed to create patient surge');
    }
  }, []);

  // Scenario: Hospital Rejection
  const handleHospitalRejection = useCallback(async () => {
    if (batchResults === null || batchResults.results.length === 0) {
      addToast('warning', 'No Batch Results', 'Please run batch allocation first');
      return;
    }

    try {
      // Find an assigned emergency to reject
      const assignedResult = batchResults.results.find(r => r.status === 'ASSIGNED' && r.assigned_hospital_id !== null);
      if (!assignedResult) {
        addToast('warning', 'No Assigned Emergencies', 'No emergencies were assigned in the last batch allocation');
        return;
      }

      const emergencyId = assignedResult.emergency_id;
      let hospitalId = assignedResult.assigned_hospital_id!;

      // Get the allocation request for this emergency-hospital pair
      const requests = await getEmergencyRequests(emergencyId);
      let request = requests.find(r => r.hospital_id === hospitalId && r.status === 'PENDING');

      if (!request) {
        // If automation already confirmed this handover, leave it intact and
        // create a fresh pending request for the rejection demonstration.
        const currentHospitals = await getHospitals();
        const candidate = currentHospitals
          .filter(item => item.status === 'Active')
          .map(item => ({ hospital: item, resource: item.resources.find(resource => resource.available > 0) }))
          .find(item => item.resource);
        if (!candidate?.resource) {
          addToast('warning', 'No Capacity for Rejection Demo', 'No active hospital has an available resource for a new request.');
          return;
        }
        const [newEmergency] = await createSimulationEmergencies(1, 'HIGH', candidate.resource.resource_type);
        hospitalId = candidate.hospital.id;
        request = await createAllocationRequest(newEmergency.id, hospitalId);
      }

      // Reject the request
      await rejectAllocationRequest(request.id, 'Simulated hospital rejection for demonstration');

      addTimelineEvent(
        'hospital_rejection',
        'Hospital Rejected Request',
        `Hospital rejected allocation request for emergency #${request.emergency_case_id}`,
        request.emergency_case_id,
        hospitalId,
        'REJECTED'
      );

      addToast('warning', 'Hospital Rejection Simulated',
        `Hospital rejected allocation request for emergency #${request.emergency_case_id}`);

      // Replan immediately; rejected hospital/emergency pairs are excluded.
      await runBatchAllocation(request.emergency_case_id === emergencyId ? [] : [request.emergency_case_id]);
    } catch (err) {
      addToast('error', 'Rejection Failed', 'Failed to simulate hospital rejection');
    }
  }, [batchResults, runBatchAllocation, createSimulationEmergencies, addToast, addTimelineEvent]);

  // Scenario: Resource Loss
  const handleResourceLoss = useCallback(async () => {
    if (batchResults === null || batchResults.results.length === 0) {
      addToast('warning', 'No Batch Results', 'Please run batch allocation first');
      return;
    }

    try {
      // Find a hospital that has resources assigned in the batch
      const assignedResults = batchResults.results.filter(r => r.status === 'ASSIGNED' && r.assigned_hospital_id !== null);
      if (assignedResults.length === 0) {
        addToast('warning', 'No Assigned Resources', 'No resources were assigned in the last batch allocation');
        return;
      }

      // Pick a random assigned hospital
      const randomIndex = Math.floor(Math.random() * assignedResults.length);
      const result = assignedResults[randomIndex];
      const hospitalId = result.assigned_hospital_id!;

      // Get hospital to see what resources it has
      const hospital = hospitals.find(h => h.id === hospitalId);
      if (!hospital) {
        addToast('error', 'Hospital Not Found', 'Could not find hospital details');
        return;
      }

      // Find a resource that was likely used (non-zero availability)
      const usedResource = hospital.resources.find(r =>
        r.available > 0 &&
        (r.resource_type === 'ICU_BED' || r.resource_type === 'VENTILATOR')
      );

      if (!usedResource) {
        addToast('warning', 'No Available Resources', 'Could not find a resource to simulate loss');
        return;
      }

      // Simulate resource loss by setting available to 0
      await updateHospitalResource(hospitalId, {
        resource_type: usedResource.resource_type,
        total: usedResource.total,
        available: 0, // Simulate complete resource loss
        reserved: usedResource.reserved,
        buffer: usedResource.buffer
      });

      // Track that this hospital was modified
      setModifiedHospitals(prev => new Set(prev).add(hospitalId));

      addTimelineEvent(
        'resource_loss',
        'Resource Loss Simulated',
        `Simulated complete loss of ${usedResource.resource_type} at hospital (available: 0)`,
        undefined,
        hospitalId,
        'RESOURCE_LOSS'
      );

      addToast('warning', 'Resource Loss Simulated',
        `Simulated loss of ${usedResource.resource_type} at hospital`);

      await runBatchAllocation();
    } catch (err) {
      addToast('error', 'Resource Loss Failed', 'Failed to simulate resource loss');
    }
  }, [batchResults, hospitals, runBatchAllocation, addTimelineEvent, addToast]);

  // Accept one handover, start travel, then change its hospital's availability.
  // The accepted patient stays assigned while the remaining batch is replanned.
  const handleAvailabilityChangeDuringTravel = useCallback(async () => {
    const assigned = batchResults?.results.find(result =>
      result.status === 'ASSIGNED' && result.assigned_hospital_id !== null
    );
    if (!assigned || assigned.assigned_hospital_id === null) {
      addToast('warning', 'No Assigned Patients', 'Run batch allocation before simulating an availability change during travel.');
      return;
    }

    const emergency = simulationEmergencies.find(item => item.id === assigned.emergency_id);
    const hospital = hospitals.find(item => item.id === assigned.assigned_hospital_id);
    const required = emergency?.requirements.find(item => item.required) ?? emergency?.requirements[0];
    const resource = hospital?.resources.find(item => item.resource_type === required?.resource_type);
    if (!emergency || !hospital || !required || !resource) {
      addToast('error', 'Scenario Could Not Start', 'The assigned patient or required hospital resource is no longer available.');
      return;
    }

    setIsRunningBatch(true);
    try {
      let requests = await getEmergencyRequests(emergency.id);
      let request = requests.find(item => item.hospital_id === hospital.id && item.status === 'PENDING');
      if (!request && !requests.some(item => item.hospital_id === hospital.id && item.status === 'ACCEPTED')) {
        request = await createAllocationRequest(emergency.id, hospital.id);
      }

      if (request?.status === 'PENDING') {
        await acceptAllocationRequest(request.id);
      }
      await updateEmergencyStatus(emergency.id, 'EN_ROUTE');
      const refreshedHospital = (await getHospitals()).find(item => item.id === hospital.id);
      const refreshedResource = refreshedHospital?.resources.find(item => item.resource_type === resource.resource_type);
      if (!refreshedResource) throw new Error('The hospital resource disappeared during the travel scenario.');
      await updateHospitalResource(hospital.id, {
        resource_type: refreshedResource.resource_type,
        total: refreshedResource.total,
        available: 0,
        reserved: refreshedResource.reserved,
        buffer: refreshedResource.buffer,
      });

      addTimelineEvent(
        'resource_loss',
        'Availability Changed During Travel',
        `Emergency #${emergency.id} is en route to ${hospital.name}. ${resource.resource_type} availability changed to 0; its confirmed reservation is preserved while the remaining batch is replanned.`,
        emergency.id,
        hospital.id,
        'RESOURCE_LOSS'
      );
      setHospitals(await getHospitals());
      await runBatchAllocation();
      addToast('success', 'Replanning Complete', 'The en-route handover kept its confirmed reservation; other patients were replanned against current availability.');
    } catch (err) {
      setError(parseApiError(err).message);
      addToast('error', 'Travel Scenario Failed', 'Could not simulate the availability change during travel.');
    } finally {
      setIsRunningBatch(false);
    }
  }, [batchResults, simulationEmergencies, hospitals, runBatchAllocation, addToast, addTimelineEvent]);

  const handleTravelTimeChange = useCallback(async () => {
    const assignment = batchResults?.results.find(result =>
      result.status === 'ASSIGNED' && result.assigned_hospital_id !== null
    );
    const hospital = assignment?.assigned_hospital_id === null || assignment?.assigned_hospital_id === undefined
      ? undefined
      : hospitals.find(item => item.id === assignment.assigned_hospital_id);
    if (!assignment || !hospital || hospital.latitude === undefined || hospital.longitude === undefined) {
      addToast('warning', 'No Routed Patients', 'Run batch allocation with a located hospital before changing travel time.');
      return;
    }

    setIsRunningBatch(true);
    try {
      // Move the hospital in the simulation map to change its estimated route
      // distance. The original coordinates are restored by Reset Simulation.
      const latitude = hospital.latitude + 0.08;
      const longitude = hospital.longitude + 0.08;
      await updateHospital(hospital.id, { name: hospital.name, latitude, longitude });
      addTimelineEvent(
        'travel_time_change',
        'Travel Time Changed',
        `Updated ${hospital.name}'s simulated location while emergency #${assignment.emergency_id} is in the batch. Travel estimates and rankings were recalculated.`,
        assignment.emergency_id,
        hospital.id,
        'INFO'
      );
      setHospitals(await getHospitals());
      await runBatchAllocation();
      addToast('success', 'Travel Time Replanned', 'The allocator recalculated routes and hospital rankings using the changed travel time.');
    } catch (err) {
      setError(parseApiError(err).message);
      addToast('error', 'Travel Time Scenario Failed', 'Could not update the simulated route and replan.');
    } finally {
      setIsRunningBatch(false);
    }
  }, [batchResults, hospitals, runBatchAllocation, addToast, addTimelineEvent]);

  // Scenario: Insufficient Capacity
  const handleInsufficientCapacity = useCallback(async () => {
    try {
      // Create emergencies that exceed total capacity
      // First, check total available resources
      let totalIcuAvailable = 0;
      let totalVentAvailable = 0;

      hospitals.forEach(hospital => {
        hospital.resources.forEach(resource => {
          if (resource.resource_type === 'ICU_BED') {
            totalIcuAvailable += resource.available;
          } else if (resource.resource_type === 'VENTILATOR') {
            totalVentAvailable += resource.available;
          }
        });
      });

      // Create emergencies that exceed capacity by 50%
      const icuNeeded = Math.floor(totalIcuAvailable * 1.5) + 2;

      await createSimulationEmergencies(icuNeeded, 'HIGH', 'ICU_BED');

      addToast('info', 'Insufficient Capacity Scenario',
        `Created ${icuNeeded} emergencies requiring ICU beds (available: ${totalIcuAvailable})`);
    } catch (err) {
      addToast('error', 'Insufficient Capacity Failed', 'Failed to create insufficient capacity scenario');
    }
  }, [hospitals]);

  // Reset simulation button
  const handleResetSimulation = useCallback(async () => {
    if (window.confirm('Reset all simulation data to original state? This will clear all created emergencies and restore hospital resources.')) {
      await resetSimulation();
    }
  }, [resetSimulation]);

  if (isLoading) {
    return <LoadingSpinner label="Initializing Allocation Simulation..." />;
  }

  // Calculate summary statistics
  const totalEmergencies = simulationEmergencies.length;
  const assignedCount = batchResults?.results.filter(r => r.status === 'ASSIGNED').length || 0;
  const unservedCount = batchResults?.results.filter(r => r.status === 'UNSERVED').length || 0;
  const pendingConfirmationCount = batchResults?.results.filter(r =>
    r.status === 'ASSIGNED' && r.request_status === 'PENDING'
  ).length || 0;

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Award className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-xl font-bold text-slate-100">
                Multi-Patient Allocation & Replanning Simulation
              </h1>
              <p className="text-sm text-slate-400">
                Priority: Critical &gt; High &gt; Moderate &gt; Low. For each patient, choose the highest-scoring feasible hospital using resource fit (45%), travel time (30%), data freshness (15%), and specialization (10%), while respecting remaining capacity.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400">WebSocket: Connected</span>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={handleResetSimulation}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset Simulation
            </Button>
            <Link to="/dispatcher" className="text-sm text-slate-400 hover:text-slate-200">
              <ArrowLeft className="w-4 h-4" /> Return to Dispatcher
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 py-6">
        {error && <ErrorAlert message={error} onRetry={initializeSimulation} />}

        <div className="max-w-7xl mx-auto space-y-6">

          {/* Simulation Controls */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">
              Simulation Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Button
                variant="primary"
                onClick={handlePatientSurge}
                disabled={isLoading || isRunningBatch}
                className="w-full"
              >
                <Zap className="w-4 h-4 mr-2" />
                Run Patient Surge
                <span className="text-xs">Create 5 high-priority emergencies</span>
              </Button>

              <Button
                variant="outline"
                onClick={handleHospitalRejection}
                disabled={isLoading || !batchResults || isRunningBatch}
                className="w-full"
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
                Simulate Hospital Rejection
                <span className="text-xs">Reject an assigned emergency</span>
              </Button>

              <Button
                variant="outline"
                onClick={handleResourceLoss}
                disabled={isLoading || !batchResults || isRunningBatch}
                className="w-full"
              >
                <Activity className="w-4 h-4 mr-2" />
                Simulate Resource Loss
                <span className="text-xs">Remove critical resource from hospital</span>
              </Button>

              <Button
                variant="outline"
                onClick={handleAvailabilityChangeDuringTravel}
                disabled={isLoading || !batchResults || isRunningBatch}
                className="w-full"
              >
                <Truck className="w-4 h-4 mr-2" />
                Availability Change During Travel
                <span className="text-xs">Preserve the confirmed handover and replan others</span>
              </Button>

              <Button
                variant="outline"
                onClick={handleTravelTimeChange}
                disabled={isLoading || !batchResults || isRunningBatch}
                className="w-full"
              >
                <Compass className="w-4 h-4 mr-2" />
                Change Travel Time & Replan
                <span className="text-xs">Update a hospital route and rerank the batch</span>
              </Button>

              <Button
                variant="outline"
                onClick={handleInsufficientCapacity}
                disabled={isLoading || isRunningBatch}
                className="w-full"
              >
                <CircleAlert className="w-4 h-4 mr-2" />
                Insufficient Capacity
                <span className="text-xs">Create emergencies exceeding capacity</span>
              </Button>

              <Button
                variant="outline"
                onClick={runBatchAllocation}
                disabled={isLoading || simulationEmergencies.length === 0 || isRunningBatch}
                className="w-full"
              >
                <Bot className="w-4 h-4 mr-2" />
                Run Batch Allocation
                <span className="text-xs">Process all simulation emergencies</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  // Show help modal or info
                  addToast('info', 'Simulation Help',
                    'Use the controls above to create scenarios, then run batch allocation to see how the system handles competing emergencies and automatically replans when conditions change.');
                }}
                className="w-full"
              >
                <Info className="w-4 h-4 mr-2" />
                Help
              </Button>
            </div>
          </div>

          {/* Batch Overview */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">
              Batch Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-sm text-slate-400">Total Patients</div>
                <div className="text-2xl font-bold text-slate-100">{totalEmergencies}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-slate-400">Assigned</div>
                <div className="text-2xl font-bold text-emerald-400">{assignedCount}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-slate-400">Unserved</div>
                <div className="text-2xl font-bold text-red-400">{unservedCount}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-slate-400">Awaiting Confirmation</div>
                <div className="text-2xl font-bold text-amber-400">{pendingConfirmationCount}</div>
              </div>
            </div>
          </div>

          {/* Patient Allocation Board */}
          {!isLoading && simulationEmergencies.length > 0 && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-4">
                Patient Allocation Board
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-800">
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Patient ID</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Urgency</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Resources</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Assignment</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Hospital</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">ETA</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Status</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {simulationEmergencies.map(emergency => {
                      const result = batchResults?.results.find(r => r.emergency_id === emergency.id);
                      const isAssigned = result && result.status === 'ASSIGNED';
                      const hospitalName = isAssigned && result.assigned_hospital_id
                        ? hospitals.find(h => h.id === result.assigned_hospital_id)?.name || 'Unknown'
                        : 'None';
                      const etaMinutes = isAssigned && result.assignment_details?.estimated_travel_minutes
                        ? `${result.assignment_details.estimated_travel_minutes} min`
                        : 'N/A';

                      return (
                        <tr key={emergency.id} className="hover:bg-slate-800">
                          <td className="px-4 py-3 text-sm font-mono">{emergency.id}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded
                              ${emergency.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                                emergency.severity === 'HIGH' ? 'bg-orange-500 text-white' :
                                emergency.severity === 'MODERATE' ? 'bg-yellow-500 text-black' :
                                'bg-blue-500 text-white'}`}>
                              {emergency.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {emergency.requirements.map((req, idx) => (
                              <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs
                                bg-slate-800/20 text-slate-200 mr-1 mb-1">
                                {req.resource_type} ×{req.quantity}
                              </span>
                            ))}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {isAssigned ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mr-2" />
                                <span>Assigned</span>
                              </>
                            ) : (
                              <>
                                <CircleAlert className="w-4 h-4 text-red-400 mr-2" />
                                <span>Pending</span>
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">{hospitalName}</td>
                          <td className="px-4 py-3 text-sm text-center">{etaMinutes}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded
                              ${result?.status === 'ASSIGNED' && result.request_status === 'ACCEPTED' ? 'bg-emerald-500 text-white' :
                                result?.status === 'ASSIGNED' && result.request_status === 'PENDING' ? 'bg-amber-500 text-white' :
                                result?.status === 'ASSIGNED' ? 'bg-blue-500 text-white' :
                                result?.status === 'UNSERVED' ? 'bg-red-500 text-white' :
                                result?.status === 'FAILED' ? 'bg-purple-500 text-white' :
                                result?.status === 'PENDING_MANUAL' ? 'bg-amber-500 text-white' :
                                'bg-slate-500 text-white'}`}>
                              {result?.status === 'ASSIGNED'
                                ? result.request_status === 'ACCEPTED'
                                  ? 'CONFIRMED'
                                  : result.request_status === 'PENDING'
                                    ? 'AWAITING APPROVAL'
                                    : 'PROPOSED'
                                : result?.status || 'PENDING'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs max-w-[200px]">
                            {result ? (
                              <div className="flex flex-col gap-1">
                                <span className="font-mono">{result.status === 'ASSIGNED' ? '✓' : '✗'}</span>
                                <span className="text-[11px]">{result.explanation}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] italic">Awaiting processing...</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Show empty state if no emergencies */}
                    {simulationEmergencies.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-center text-slate-400" colSpan={8}>
                          No simulation emergencies created. Use "Run Patient Surge" to create test emergencies.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Hospital Resource Board */}
          {!isLoading && hospitals.length > 0 && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-4">
                Hospital Resource Availability
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-800">
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Hospital</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">ICU Beds</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Ventilators</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Status</th>
                      <th className="px-4 py-3 text-left text-slate-400 text-sm font-bold">Modified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {hospitals.map(hospital => {
                      const icuResource = hospital.resources.find(r => r.resource_type === 'ICU_BED');
                      const ventResource = hospital.resources.find(r => r.resource_type === 'VENTILATOR');
                      const isModified = modifiedHospitals.has(hospital.id);

                      return (
                        <tr key={hospital.id} className={`hover:bg-slate-800 ${isModified ? 'border-l-4 border-emerald-400' : ''}`}>
                          <td className="px-4 py-3 text-sm font-mono">{hospital.name}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            {icuResource ? (
                              <span className="font-mono">
                                {icuResource.available}/{icuResource.total}
                              </span>
                            ) : (
                              <span className="text-slate-400">0/0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {ventResource ? (
                              <span className="font-mono">
                                {ventResource.available}/{ventResource.total}
                              </span>
                            ) : (
                              <span className="text-slate-400">0/0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded
                              ${hospital.status === 'Active' ? 'bg-emerald-500 text-white' :
                                hospital.status === 'Busy' ? 'bg-orange-500 text-white' :
                                hospital.status === 'Offline' ? 'bg-red-500 text-white' :
                                'bg-slate-500 text-white'}`}>
                              {hospital.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {isModified ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <CircleHelp className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="mt-4 text-xs text-slate-400 flex flex-wrap gap-4">
                <div className="flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Modified in simulation</span>
                </div>
                <div className="flex items-center space-x-1">
                  <CircleHelp className="w-3 h-3 text-slate-400" />
                  <span>Original state</span>
                </div>
              </div>
            </div>
          )}

          {/* Replanning Timeline */}
          {!isLoading && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-bold text-slate-100 mb-4">
                Replanning Timeline & Event Log
              </h2>
              <div className="space-y-3">
                {timelineEvents.map(event => (
                  <div
                    key={event.id}
                    className={`border-l-4 ${
                      event.type === 'hospital_rejection' ? 'border-red-500' :
                      event.type === 'resource_loss' ? 'border-orange-500' :
                      event.type === 'allocation_assigned' ? 'border-emerald-500' :
                      event.type === 'allocation_unserved' ? 'border-amber-500' :
                      event.type === 'batch_start' || event.type === 'batch_complete' ? 'border-blue-500' :
                      'border-slate-500'
                    } pl-4 py-2 mb-2`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <div className="text-xs font-mono">
                            [{formatTimestamp(event.timestamp)}]
                          </div>
                          <span className="font-medium text-slate-100">{event.title}</span>
                          {event.emergencyId && (
                            <span className="ml-2 text-xs text-slate-400">Emergency #{event.emergencyId}</span>
                          )}
                          {event.hospitalId && (
                            <span className="ml-2 text-xs text-slate-400">Hospital #{event.hospitalId}</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-400 line-clamp-2">
                          {event.description}
                        </p>
                      </div>
                      <div
                        className={`text-xs text-center ${
                          event.outcome === 'ASSIGNED' ? 'text-emerald-500' :
                          event.outcome === 'UNSERVED' ? 'text-red-500' :
                          event.outcome === 'REJECTED' ? 'text-orange-500' :
                          event.outcome === 'INFO' ? 'text-slate-400' :
                          'text-slate-500'
                        }`}
                      >
                        {[event.outcome === 'ASSIGNED' && '✓',
                         event.outcome === 'UNSERVED' && '✗',
                         event.outcome === 'REJECTED' && '↩',
                         event.outcome === 'INFO' && '●'][0] || '•'}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Show message if no events */}
                {timelineEvents.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    No events yet. Run a scenario to see the replanning timeline.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* How the Allocator Decides */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-4">
              How the Allocator Decides
            </h2>
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-100 mb-2">
                  Allocation Policy (Weights)
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      <span>Resource Match</span>
                    </div>
                    <div className="text-slate-400">45%</div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <span>Travel Time</span>
                    </div>
                    <div className="text-slate-400">30%</div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-amber-500" />
                      <span>Data Freshness</span>
                    </div>
                    <div className="text-slate-400">15%</div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-purple-500" />
                      <span>Specialization</span>
                    </div>
                    <div className="text-slate-400">10%</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-100 mb-2">
                  Decision Process
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>1. Filter eligible hospitals (resource compatibility, capacity, status)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>2. Score each emergency-hospital pair using weighted formula</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>3. Prioritize by emergency severity (Critical &gt; High &gt; Moderate &gt; Low)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>4. Assign greedily: highest severity + highest score first</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>5. Reserve resources atomically upon acceptance</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>6. Replan when conditions change (rejections, resource loss, etc.)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-900 border-t border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto text-center text-sm text-slate-500">
          <p>
            Multi-Patient Allocation & Replanning Simulation •
            <span className="font-mono">v1.0.0</span> •
            Demonstrates HLTH 02 Addition 1: Allocation for Multiple Patients with Replanning
          </p>
        </div>
      </div>
    </div>
  );
};

// Helper button component
const Button = ({
  variant = 'primary',
  onClick,
  disabled = false,
  children,
  className = ''
}: {
  variant?: 'primary' | 'outline' | 'secondary';
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) => {
  const baseClasses = 'px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outline: 'border border-emerald-500 hover:bg-emerald-500/10 text-emerald-500 hover:text-emerald-700',
    secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700'
  };
  const selectedVariantClasses = variantClasses[variant] || variantClasses.primary;

  return (
    <button
      className={`${baseClasses} ${selectedVariantClasses} ${className}`}
      onClick={async (e) => {
        e.preventDefault();
        await onClick();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default AllocationSimulation;
