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

export const transcribeEmergencyAudio = async (audio: Blob): Promise<string> => {
  const extension = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'm4a' : 'webm';
  const form = new FormData();
  form.append('file', audio, `emergency-recording.${extension}`);
  const response = await apiClient.post<{ transcript: string }>('/ai/transcribe-audio', form, {
    timeout: 120000,
    // apiClient defaults to JSON; this endpoint requires a multipart UploadFile.
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.transcript;
};

export const analyzeEmergencyDescription = async (
  description: string
): Promise<EmergencyAnalyzeResponse> => {
  const response = await apiClient.post<EmergencyAnalyzeResponse>('/ai/analyze-emergency', {
    description,
  });
  return response.data;
};
