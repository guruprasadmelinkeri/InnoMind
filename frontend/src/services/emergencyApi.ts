import { apiClient } from './api';
import type { EmergencyCase, EmergencyCaseCreate, EmergencyStatus } from '../types/emergency';

export const getEmergencies = async (): Promise<EmergencyCase[]> => {
  const response = await apiClient.get<EmergencyCase[]>('/emergencies');
  return response.data;
};

export const getEmergencyById = async (emergencyId: number): Promise<EmergencyCase> => {
  const response = await apiClient.get<EmergencyCase>(`/emergencies/${emergencyId}`);
  return response.data;
};

export const createEmergency = async (data: EmergencyCaseCreate): Promise<EmergencyCase> => {
  const response = await apiClient.post<EmergencyCase>('/emergencies', data);
  return response.data;
};

export const updateEmergencyStatus = async (
  emergencyId: number,
  status: EmergencyStatus
): Promise<EmergencyCase> => {
  const response = await apiClient.patch<EmergencyCase>(`/emergencies/${emergencyId}/status`, { status });
  return response.data;
};

export const deleteEmergency = async (emergencyId: number): Promise<void> => {
  await apiClient.delete(`/emergencies/${emergencyId}`);
};
