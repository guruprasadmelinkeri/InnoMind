import { apiClient } from './api';
import type { Handoff } from '../types/handoff';

export const startHandoff = async (emergencyId: number): Promise<Handoff> => {
  const response = await apiClient.post<Handoff>(`/emergencies/${emergencyId}/handoff/start`);
  return response.data;
};

export const completeHandoff = async (
  emergencyId: number,
  data: { received_by: string; notes?: string }
): Promise<Handoff> => {
  const response = await apiClient.post<Handoff>(`/emergencies/${emergencyId}/handoff/complete`, data);
  return response.data;
};

export const getHandoff = async (emergencyId: number): Promise<Handoff> => {
  const response = await apiClient.get<Handoff>(`/emergencies/${emergencyId}/handoff`);
  return response.data;
};
