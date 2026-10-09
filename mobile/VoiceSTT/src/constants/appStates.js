// ─── App State Machine ────────────────────────────────────────────────────────
export const STATE = {
  IDLE: 'IDLE',
  RECORDING: 'RECORDING',
  RECORDED: 'RECORDED',
  REQUESTING_LOCATION: 'REQUESTING_LOCATION',
  UPLOADING: 'UPLOADING',
  TRANSCRIBING: 'TRANSCRIBING',
  PROCESSING_EMERGENCY: 'PROCESSING_EMERGENCY',
  SUCCESS: 'SUCCESS',
  HOSPITAL_SELECTION: 'HOSPITAL_SELECTION',
  AMBULANCE_TRACKING: 'AMBULANCE_TRACKING',
  MICROPHONE_ERROR: 'MICROPHONE_ERROR',
  LOCATION_ERROR: 'LOCATION_ERROR',
  UPLOAD_ERROR: 'UPLOAD_ERROR',
  TRANSCRIPTION_ERROR: 'TRANSCRIPTION_ERROR',
  EMERGENCY_ERROR: 'EMERGENCY_ERROR',
};

export const ERROR_STATES = new Set([
  STATE.MICROPHONE_ERROR,
  STATE.LOCATION_ERROR,
  STATE.UPLOAD_ERROR,
  STATE.TRANSCRIPTION_ERROR,
  STATE.EMERGENCY_ERROR,
]);

export const RETRYABLE_STATES = new Set([
  STATE.LOCATION_ERROR,
  STATE.UPLOAD_ERROR,
  STATE.TRANSCRIPTION_ERROR,
]);

export const FLOW_STEPS = [
  { key: STATE.IDLE,               label: 'Voice'     },
  { key: STATE.RECORDING,          label: 'Record'    },
  { key: STATE.RECORDED,           label: 'Saved'     },
  { key: STATE.REQUESTING_LOCATION,label: 'Location'  },
  { key: STATE.UPLOADING,          label: 'Upload'    },
  { key: STATE.TRANSCRIBING,       label: 'AI'        },
  { key: STATE.PROCESSING_EMERGENCY, label: 'Processing' },
  { key: STATE.SUCCESS,            label: 'Success'   },
  { key: STATE.HOSPITAL_SELECTION, label: 'Hospitals' },
  { key: STATE.AMBULANCE_TRACKING, label: 'Tracking'  },
];
