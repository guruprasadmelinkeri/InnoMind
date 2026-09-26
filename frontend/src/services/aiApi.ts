import { apiClient } from './api';
import type { EmergencySeverity } from '../types/emergency';
import type { ResourceType } from '../types/hospital';

export interface RequiredResourceItem {
  resource_type: ResourceType;
  quantity: number;
}

export interface EmergencyAnalyzeResponse {
  severity: EmergencySeverity;
  patient_age?: number;
  summary: string;
  required_resources: RequiredResourceItem[];
  reasoning: string[];
}

export const analyzeEmergencyDescription = async (
  description: string
): Promise<EmergencyAnalyzeResponse> => {
  const response = await apiClient.post<EmergencyAnalyzeResponse>('/ai/analyze-emergency', {
    description,
  });
  return response.data;
};
