import { apiClient } from './api';
import type { BatchAllocationResult } from '../types/allocation';

/**
 * Perform batch allocation for multiple emergencies
 * @param emergencyIds Array of emergency case IDs to allocate
 * @returns Batch allocation results with assignments and explanations
 */
export const performBatchAllocation = async (
  emergencyIds: number[]
): Promise<BatchAllocationResult> => {
  const response = await apiClient.post<BatchAllocationResult>(
    '/batch-allocation',
    emergencyIds
  );
  return response.data;
};