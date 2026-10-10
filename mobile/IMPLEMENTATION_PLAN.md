# MediRoute Mobile App Implementation Plan

## Backend Endpoints Discovered

### 1. Hospitals API
- **GET** `/hospitals` - List all hospitals (query: skip, limit)
- **GET** `/hospitals/{hospital_id}` - Get hospital by ID
- **GET** `/hospitals/{hospital_id}/resources` - Get hospital resources

### 2. Ambulances API
- **GET** `/ambulances` - List all ambulances
- **GET** `/ambulances/{ambulance_id}` - Get ambulance by ID
- **PATCH** `/ambulances/{ambulance_id}/status` - Update ambulance status

### 3. Emergencies API
- **POST** `/emergencies` - Create emergency case (body: pickup_latitude, pickup_longitude, severity, patient_age, description, requirements[])
- **GET** `/emergencies/{emergency_id}/recommendations` - Get hospital recommendations
- **POST** `/emergencies/{emergency_id}/requests` - Create allocation request (body: hospital_id)
- **POST** `/emergencies/{emergency_id}/assign-ambulance` - Assign ambulance (body: ambulance_id)
- **GET** `/emergencies/{emergency_id}` - Get emergency case details
- **PATCH** `/emergencies/{emergency_id}/status` - Update emergency status

### 4. Allocation Requests API
- **GET** `/allocation-requests/{request_id}` - Get allocation request details
- **POST** `/allocation-requests/{request_id}/accept` - Accept allocation request
- **POST** `/allocation-requests/{request_id}/reject` - Reject allocation request (body: reason)

## Mobile Implementation Plan

### 1. API Service Layer
- Create `/mobile/src/services/api.js` - Centralized API client using `fetch`
- Base URL: `http://localhost:8000` (from backend CORS config)
- Functions for each endpoint with proper error handling

### 2. State Management
- Use React Native Context API or existing state management
- Store: hospitals, ambulances, activeEmergency, allocationRequests

### 3. Screens to Implement
- **HospitalListScreen** - Display list of hospitals from `/hospitals` endpoint
- **HospitalDetailScreen** - Show hospital details and resources
- **AmbulanceMapScreen** - Show ambulances on map with locations
- **EmergencyFormScreen** - Form to report new emergency (location + details)
- **EmergencyStatusScreen** - Show active emergency status and recommendations
- **RequestStatusScreen** - Show allocation request status and actions

### 4. Reuse Analysis
**From mobile/VoiceSTT (Expo project):**
- Expo setup and configuration
- Basic project structure (App.js, index.js, app.json)
- Can reuse: project configuration, build setup

**To Create:**
- All screens, components, API services, navigation
- State management for medical data
- Map integration for ambulance/hospital locations
- Form handling for emergency reporting

### 5. Files That Need Modification/CREATION
Since there's no existing MediRoute mobile app, I'll need to create:
- `/mobile/src/` - Source directory for MediRoute app
- `/mobile/src/screens/` - All screen components
- `/mobile/src/services/` - API service layer
- `/mobile/src/context/` - State management context
- `/mobile/src/components/` - Reusable components
- `/mobile/App.js` - Main app component with navigation
- `/mobile/src/navigation.js` - Navigation configuration

### 6. Backend Endpoints That Will Be Consumed
1. `GET /hospitals` - HospitalListScreen
2. `GET /hospitals/{id}` - HospitalDetailScreen
3. `GET /ambulances` - AmbulanceMapScreen
4. `POST /emergencies` - EmergencyFormScreen
5. `GET /emergencies/{id}/recommendations` - EmergencyStatusScreen
6. `POST /emergencies/{id}/requests` - RequestStatusScreen
7. `GET /emergencies/{id}` - EmergencyStatusScreen
8. `PATCH /ambulances/{id}/status` - AmbulanceMapScreen (real-time updates)
9. `GET /allocation-requests/{id}` - RequestStatusScreen
10. `POST /allocation-requests/{id}/accept` - RequestStatusScreen
11. `POST /allocation-requests/{id}/reject` - RequestStatusScreen

### 7. Functionality That Cannot Be Implemented
All required backend data appears to be available:
- Hospital data ✓
- Hospital scores/rankings (via recommendations endpoint) ✓
- Ambulance data ✓
- Ambulance status/location ✓
- Location sending (via emergency creation) ✓
- Request/status flow ✓

No missing backend endpoints identified for core MediRoute functionality.