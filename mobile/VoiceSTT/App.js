import React, { useState, useRef, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  View,
  Text,
  Animated,
} from 'react-native';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';

// ── Design System & Constants ─────────────────────────────────────────────────
import { colors } from './src/theme';
import { STATE, ERROR_STATES, RETRYABLE_STATES } from './src/constants/appStates';
import { USERNAME } from './src/constants/config';

// ── Services ──────────────────────────────────────────────────────────────────
import { requestMicPermission, enableRecordingMode } from './src/services/recording';
import { requestLocationPermission, getCurrentCoords } from './src/services/location';
import { emergencyService } from './src/services/emergencyService';
import { ambulanceService } from './src/services/ambulanceService';
import { uploadVoice } from './src/services/api';

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { usePulse } from './src/hooks/usePulse';
import { useRecordingTimer } from './src/hooks/useRecordingTimer';

// ── Utils ─────────────────────────────────────────────────────────────────────
import { formatDuration } from './src/utils/formatters';

// ── Components ────────────────────────────────────────────────────────────────
import { StateIndicator } from './src/components/StateIndicator';

// ── Screens ───────────────────────────────────────────────────────────────────
import { IdleScreen } from './src/screens/IdleScreen';
import { RecordingScreen } from './src/screens/RecordingScreen';
import { RecordedScreen } from './src/screens/RecordedScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { SuccessScreen } from './src/screens/SuccessScreen';
import { HospitalSelectionScreen } from './src/screens/HospitalSelectionScreen';
import { AmbulanceTrackingScreen } from './src/screens/AmbulanceTrackingScreen';
import { ErrorScreen } from './src/screens/ErrorScreen';

// ── Shared styles ─────────────────────────────────────────────────────────────
import { styles } from './src/components/styles';

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState(STATE.IDLE);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);
  const [location, setLocation] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [assignedAmbulanceId, setAssignedAmbulanceId] = useState(null);

  // Auto-navigation timer reference (Success → Hospital Selection)
  const autoNavTimerRef = useRef(null);

  // Audio recorder instance
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioUriRef = useRef(null);

  // Smooth, subtle opacity transition on screen change
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const isRecording = appState === STATE.RECORDING;
  const elapsedSecs = useRecordingTimer(isRecording);
  const { scale: pulseScale, opacity: pulseOpacity } = usePulse(isRecording);

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [appState]);

  useEffect(() => {
    return () => {
      if (autoNavTimerRef.current) {
        clearTimeout(autoNavTimerRef.current);
      }
    };
  }, []);

  // ── Start Recording ─────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const granted = await requestMicPermission();
      if (!granted) {
        setErrorMsg('Microphone access is required to record your emergency voice report.');
        setAppState(STATE.MICROPHONE_ERROR);
        return;
      }
      await enableRecordingMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      setAppState(STATE.RECORDING);
    } catch (err) {
      console.error('Start recording error:', err);
      setErrorMsg(`Could not activate microphone: ${err.message}`);
      setAppState(STATE.MICROPHONE_ERROR);
    }
  };

  // ── Stop Recording ──────────────────────────────────────────────────────────
  const stopRecording = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No audio file was created.');
      audioUriRef.current = uri;
      setAppState(STATE.RECORDED);
    } catch (err) {
      console.error('Stop recording error:', err);
      setErrorMsg(`Failed to complete recording: ${err.message}`);
      setAppState(STATE.UPLOAD_ERROR);
    }
  };

  // ── Location & Upload Flow ──────────────────────────────────────────────────
  const requestLocationAndUpload = async () => {
    setAppState(STATE.REQUESTING_LOCATION);
    setErrorMsg('');
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        setErrorMsg('Location permission was denied. MediRoute requires GPS coordinates to dispatch assistance.');
        setAppState(STATE.LOCATION_ERROR);
        return;
      }

      let coords;
      try {
        coords = await getCurrentCoords();
        setLocation(coords);
      } catch (locErr) {
        setErrorMsg(locErr.message);
        setAppState(STATE.LOCATION_ERROR);
        return;
      }

      await handleEmergencyCreation(coords.latitude, coords.longitude);
    } catch (err) {
      console.error('Location error:', err);
      setErrorMsg(`Location error: ${err.message}`);
      setAppState(STATE.LOCATION_ERROR);
    }
  };

  // ── Server Dispatch ─────────────────────────────────────────────────────────
  const handleEmergencyCreation = async (latitude, longitude) => {
    const audioUri = audioUriRef.current;
    if (!audioUri) {
      setErrorMsg('No audio file found. Please record again.');
      setAppState(STATE.UPLOAD_ERROR);
      return;
    }

    setAppState(STATE.UPLOADING);

    try {
      // Step 1: Get transcription from voice recording
      const voiceResult = await uploadVoice({
        audioUri,
        username: USERNAME,
        latitude,
        longitude
      });
      const transcription = voiceResult.text;

      // Step 2: Create emergency case with MediRoute backend using the transcription
      const emergency = await emergencyService.createEmergency({
        latitude,
        longitude,
        description: transcription,
        severity: 'MODERATE', // Default severity - could be enhanced with voice analysis
        requirements: [{ resource_type: 'GENERAL_BED', quantity: 1, required: true }] // Basic emergency requirement
      });

      // Step 3: Get hospital recommendations for the emergency
      const recommendations = await emergencyService.getHospitalRecommendations(emergency.id);

      // Step 4: Format recommendations for UI compatibility
      const formattedRecommendations = recommendations.map(hospital => ({
        id: hospital.id,
        name: hospital.name,
        score: Math.round((hospital.score || 0) * 100), // Convert 0-1 scale to 0-100 if needed
        rating: hospital.rating || 5.0,
        distanceKm: hospital.distance_km || 0,
        etaMinutes: `${Math.round(hospital.eta_minutes || 0)} mins`,
        address: hospital.address || '',
        latitude: hospital.latitude || 0,
        longitude: hospital.longitude || 0,
        emergencyType: hospital.emergency_type || 'Emergency Room',
        availableBeds: hospital.available_beds || 0,
        specialties: hospital.specialties || [],
        phone: hospital.phone || '',
        isMock: false
      }));

      // Step 5: Prepare result for SuccessScreen
      setResult({
        id: emergency.id,
        transcription,
        latitude: emergency.pickup_latitude,
        longitude: emergency.pickup_longitude,
        username: USERNAME,
        description: transcription,
        severity: emergency.severity || 'MODERATE',
        patient_age: emergency.patient_age,
        case_number: emergency.id,
        recommendations: formattedRecommendations
      });

      setAppState(STATE.SUCCESS);

      // Automatic transition to Hospital Selection after ~1.5 seconds
      if (autoNavTimerRef.current) {
        clearTimeout(autoNavTimerRef.current);
      }
      autoNavTimerRef.current = setTimeout(() => {
        setAppState(STATE.HOSPITAL_SELECTION);
      }, 1500);
    } catch (err) {
      console.error('Emergency creation error:', err);
      setErrorMsg(err.message || 'Failed to process emergency. Please try again.');
      // Determine if this was a voice processing error or general emergency error
      if (err.message && (err.message.includes('Voice processing') ||
                         err.message.includes('transcription') ||
                         err.message.includes('Cannot reach the backend'))) {
        setAppState(STATE.UPLOAD_ERROR); // Could also use TRANSCRIPTION_ERROR if we want to distinguish
      } else {
        setAppState(STATE.EMERGENCY_ERROR);
      }
    }
  };

  const proceedToHospitals = () => {
    if (autoNavTimerRef.current) {
      clearTimeout(autoNavTimerRef.current);
    }
    setAppState(STATE.HOSPITAL_SELECTION);
  };

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = () => {
    if (autoNavTimerRef.current) {
      clearTimeout(autoNavTimerRef.current);
    }
    audioUriRef.current = null;
    setResult(null);
    setLocation(null);
    setSelectedHospital(null);
    setErrorMsg('');
    setAppState(STATE.IDLE);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand Header ────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <View style={styles.headerDot} />
            <Text style={styles.headerServiceLabel}>EMERGENCY RESPONSE</Text>
          </View>
          <Text style={styles.headerTitle}>MediRoute</Text>
          <Text style={styles.headerSubtitle}>
            Voice Triage & Dynamic Hospital Routing
          </Text>
        </View>

        {/* ── Screen Card Surface ─────────────────────────────────────── */}
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          {appState === STATE.IDLE && (
            <IdleScreen onStart={startRecording} />
          )}

          {appState === STATE.RECORDING && (
            <RecordingScreen
              duration={formatDuration(elapsedSecs)}
              onStop={stopRecording}
              pulseScale={pulseScale}
              pulseOpacity={pulseOpacity}
            />
          )}

          {appState === STATE.RECORDED && (
            <RecordedScreen
              duration={formatDuration(elapsedSecs)}
              onSubmit={requestLocationAndUpload}
              onRedo={reset}
            />
          )}

          {appState === STATE.REQUESTING_LOCATION && (
            <LoadingScreen
              icon="📍"
              title="Acquiring GPS Position"
              subtitle="Locking device coordinates for dispatch triage…"
            />
          )}

          {appState === STATE.UPLOADING && (
            <LoadingScreen
              icon="⬆️"
              title="Transmitting Emergency Data"
              subtitle="Uploading audio package to medical dispatch center…"
            />
          )}

          {appState === STATE.TRANSCRIBING && (
            <LoadingScreen
              icon="🩺"
              title="AI Medical Triage"
              subtitle="Transcribing speech & analyzing urgency protocols…"
            />
          )}

          {appState === STATE.PROCESSING_EMERGENCY && (
            <LoadingScreen
              icon="🚨"
              title="Creating Emergency Case"
              subtitle="Processing voice transcription & location data…"
            />
          )}

          {appState === STATE.SUCCESS && result && (
            <SuccessScreen
              result={result}
              location={location}
              onProceed={proceedToHospitals}
              onReset={reset}
            />
          )}

          {appState === STATE.HOSPITAL_SELECTION && (
            <HospitalSelectionScreen
              userLocation={location}
              recommendations={result?.recommendations || []}
              emergencyId={result?.id}
              onSelectHospital={async (hospital) => {
                try {
                  setSelectedHospital(hospital);
                  setAppState(STATE.PROCESSING_EMERGENCY); // Show processing state

                  // Create allocation request for the selected hospital
                  const allocationRequest = await emergencyService.createAllocationRequest(
                    result.id,
                    hospital.id
                  );

                  // Accept the allocation request to reserve resources
                  await emergencyService.acceptAllocationRequest(allocationRequest.id);

                  // Assign an ambulance to the emergency (in a real system, this might be automatic
                  // or based on availability; for now we'll assign the first available ambulance)
                  // For simplicity, we'll get a list of ambulances and assign the first one
                  const ambulances = await ambulanceService.getAmbulances();
                  if (ambulances.length > 0) {
                    const ambulanceToAssign = ambulances[0]; // In reality, this would be smarter selection
                    await emergencyService.assignAmbulance(
                      result.id,
                      ambulanceToAssign.id
                    );
                    setAssignedAmbulanceId(ambulanceToAssign.id);
                    setSelectedHospital(hospital);
                    setAppState(STATE.AMBULANCE_TRACKING);
                  } else {
                    throw new Error('No ambulances available');
                  }
                } catch (err) {
                  console.error('Hospital selection error:', err);
                  setErrorMsg(err.message || 'Failed to process hospital selection. Please try again.');
                  setAppState(STATE.EMERGENCY_ERROR);
                }
              }}
              onBack={() => setAppState(STATE.SUCCESS)}
            />
          )}

          {appState === STATE.AMBULANCE_TRACKING && (
            <AmbulanceTrackingScreen
              selectedHospital={selectedHospital}
              userLocation={location}
              ambulanceId={assignedAmbulanceId}
              onBack={() => setAppState(STATE.HOSPITAL_SELECTION)}
              onReset={reset}
            />
          )}

          {ERROR_STATES.has(appState) && (
            <ErrorScreen
              state={appState}
              message={errorMsg}
              onRetry={RETRYABLE_STATES.has(appState) ? requestLocationAndUpload : undefined}
              onReset={reset}
            />
          )}
        </Animated.View>

        {/* ── Progress Flow Indicator ─────────────────────────────────── */}
        <StateIndicator currentState={appState} />
      </ScrollView>
    </SafeAreaView>
  );
}