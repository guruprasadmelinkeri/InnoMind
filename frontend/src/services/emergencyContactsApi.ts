import { apiClient } from './api';

export type EmergencyContact = { id: number; label: string; contact_type: 'EMAIL' | 'PHONE'; value: string };
export type EmergencyContactInput = Omit<EmergencyContact, 'id'>;

export const getEmergencyContacts = async () => (await apiClient.get<EmergencyContact[]>('/emergency-contacts')).data;
export const addEmergencyContact = async (contact: EmergencyContactInput) =>
  (await apiClient.post<EmergencyContact>('/emergency-contacts', contact)).data;
export const deleteEmergencyContact = async (id: number) => apiClient.delete(`/emergency-contacts/${id}`);
