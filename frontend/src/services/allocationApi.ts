import { apiClient } from './api';
import type { RecommendationResponse } from '../types/allocation';
import type { AllocationRequest, Reservation } from '../types/reservation';

export const getRecommendations = async (emergencyId: number): Promise<RecommendationResponse> => {
  const response = await apiClient.get<RecommendationResponse>(`/emergencies/${emergencyId}/recommendations`);
  return response.data;
};

export const createAllocationRequest = async (
  emergencyId: number,
  hospitalId: number
): Promise<AllocationRequest> => {
  const response = await apiClient.post<AllocationRequest>(`/emergencies/${emergencyId}/requests`, {
    hospital_id: hospitalId,
  });
  return response.data;
};

export const getEmergencyRequests = async (emergencyId: number): Promise<AllocationRequest[]> => {
  const response = await apiClient.get<AllocationRequest[]>(`/emergencies/${emergencyId}/requests`);
  return response.data;
};

export const getEmergencyReservations = async (emergencyId: number): Promise<Reservation[]> => {
  const response = await apiClient.get<Reservation[]>(`/emergencies/${emergencyId}/reservations`);
  return response.data;
};
