import { apiClient } from './api';
import type { AllocationRequest, AcceptSuccessResponse } from '../types/reservation';

export const acceptAllocationRequest = async (requestId: number): Promise<AcceptSuccessResponse> => {
  const response = await apiClient.post<AcceptSuccessResponse>(`/allocation-requests/${requestId}/accept`);
  return response.data;
};

export const rejectAllocationRequest = async (
  requestId: number,
  reason: string
): Promise<AllocationRequest> => {
  const response = await apiClient.post<AllocationRequest>(`/allocation-requests/${requestId}/reject`, {
    reason,
  });
  return response.data;
};

export const getAllocationRequestById = async (requestId: number): Promise<AllocationRequest> => {
  const response = await apiClient.get<AllocationRequest>(`/allocation-requests/${requestId}`);
  return response.data;
};
