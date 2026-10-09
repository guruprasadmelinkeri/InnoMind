# VoiceSTT to MediRoute Backend Integration Plan

## Overview
Modify the existing VoiceSTT Expo/React Native app to consume the MediRoute backend APIs discovered in the backend/ directory instead of its current voice transcription backend.

## Current Flow (VoiceSTT Backend)
1. Record audio → 
2. Get location → 
3. Upload audio to `http://192.168.10.43:8000/voice` (transcription service) →
4. Show success with transcription →
5. Go to HospitalSelectionScreen (with transcription) →
6. Show mock hospitals →
7. Select hospital →
8. Go to AmbulanceTrackingScreen (with mock ambulance data)

## Target Flow (MediRoute Backend)
1. Record audio → 
2. Get location → 
3. POST `/emergencies` (create emergency with location) →
4. Get emergency ID from response →
5. GET `/emergencies/{id}/recommendations` (get ranked hospitals) →
6. Go to HospitalSelectionScreen (with real hospital recommendations) →
7. Select hospital →
8. POST `/emergencies/{id}/requests` (create allocation request) →
9. POST `/emergencies/{id}/assign-ambulance` (assign ambulance) →
10. Go to AmbulanceTrackingScreen (with real ambulance tracking data) →
11. Optionally: GET `/ambulances/{ambulance_id}` for live updates

## Backend Endpoints to Use (from discovery)
- POST `/emergencies` - Create emergency case (requires pickup_latitude, pickup_longitude)
- GET `/emergencies/{emergency_id}/recommendations` - Get hospital recommendations/rankings
- POST `/emergencies/{emergency_id}/requests` - Create allocation request to hospital (requires hospital_id)
- POST `/emergencies/{emergency_id}/assign-ambulance` - Assign ambulance to emergency (requires ambulance_id)
- GET `/emergencies/{emergency_id}` - Get emergency case details
- GET `/ambulances` - List all ambulances (for tracking)
- GET `/ambulances/{ambulance_id}` - Get specific ambulance details
- PATCH `/ambulances/{ambulance_id}/status` - Update ambulance status

## Data Structures Needed
From backend schemas:
- EmergencyCaseCreate: pickup_latitude, pickup_longitude, severity?, patient_age?, description?, requirements[]
- EmergencyRequirementCreate: resource_type, quantity, required?
- HospitalResponse: id, name, address, latitude, longitude, emergency_level, trauma_center, status, resources[]
- AmbulanceRead: id, vehicle_number, status, current_latitude, current_longitude, created_at, updated_at
- AllocationRequestCreate: hospital_id
- AmbulanceAssignRequest: ambulance_id

## Implementation Steps

### 1. Create Emergency Service
Create `src/services/emergencyService.js` with functions:
- createEmergency(location, severity, description, requirements)
- getHospitalRecommendations(emergencyId)
- createAllocationRequest(emergencyId, hospitalId)
- assignAmbulance(emergencyId, ambulanceId)
- getEmergencyDetails(emergencyId)

### 2. Modify Existing Services
Update `src/services/hospitalService.js` to use real `/hospitals` endpoint instead of mock data
Update `src/services/ambulanceService.js` to use real `/ambulances` endpoints instead of mock data

### 3. Remove/Replace uploadVoice Service
Replace `src/services/api.js` uploadVoice function with emergency service integration

### 4. Update App.js Flow
Modify the success state handler to:
- Call createEmergency with location instead of uploadVoice
- Get emergency ID from response
- Fetch hospital recommendations
- Pass recommendations to HospitalSelectionScreen

### 5. Update HospitalSelectionScreen
Use real hospital data from recommendations instead of mock data
Display actual scores/rankings from backend

### 6. Update AmbulanceTrackingScreen
Track real assigned ambulance from backend
Show actual status, location, ETA from backend data

### 7. Preserve Existing UI/Components
Keep all existing screens, components, navigation, and UI design
Only change the data fetching/backend integration layer