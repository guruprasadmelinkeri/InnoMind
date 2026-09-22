import { apiClient } from './api';
import type { Hospital, HospitalResource } from '../types/hospital';

export const getHospitals = async (): Promise<Hospital[]> => {
  const response = await apiClient.get<Hospital[]>('/hospitals');
  return response.data;
};

export const getHospitalById = async (hospitalId: number): Promise<Hospital> => {
  const response = await apiClient.get<Hospital>(`/hospitals/${hospitalId}`);
  return response.data;
};

export const getHospitalResources = async (hospitalId: number): Promise<HospitalResource[]> => {
  const response = await apiClient.get<HospitalResource[]>(`/hospitals/${hospitalId}/resources`);
  return response.data;
};

export const updateHospitalResource = async (
  hospitalId: number,
  resourceData: { resource_type: string; total: number; available: number }
): Promise<HospitalResource> => {
  const response = await apiClient.post<HospitalResource>(`/hospitals/${hospitalId}/resources`, resourceData);
  return response.data;
};

