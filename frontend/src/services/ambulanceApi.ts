import { apiClient } from './api';
import type { Ambulance, AmbulanceStatus } from '../types/ambulance';
import type { EmergencyCase } from '../types/emergency';

export const getAmbulances = async (): Promise<Ambulance[]> => {
  const response = await apiClient.get<Ambulance[]>('/ambulances');
  return response.data;
};

export const getAmbulanceById = async (ambulanceId: number): Promise<Ambulance> => {
  const response = await apiClient.get<Ambulance>(`/ambulances/${ambulanceId}`);
  return response.data;
};

export const assignAmbulance = async (
  emergencyId: number,
  ambulanceId: number
): Promise<EmergencyCase> => {
  const response = await apiClient.post<EmergencyCase>(
    `/emergencies/${emergencyId}/assign-ambulance`,
    { ambulance_id: ambulanceId }
  );
  return response.data;
};

export const updateAmbulanceStatus = async (
  ambulanceId: number,
  status: AmbulanceStatus
): Promise<Ambulance> => {
  const response = await apiClient.patch<Ambulance>(
    `/ambulances/${ambulanceId}/status`,
    { status }
  );
  return response.data;
};
