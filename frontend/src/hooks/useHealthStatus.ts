import { useState, useEffect, useCallback } from 'react';
import { checkHealth } from '../services/healthService';
import type { HealthState } from '../types/health';

export const useHealthStatus = () => {
  const [state, setState] = useState<HealthState>({
    data: null,
    loading: true,
    error: null,
    lastChecked: null,
  });

  const fetchHealth = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await checkHealth();
      setState({
        data,
        loading: false,
        error: null,
        lastChecked: new Date(),
      });
    } catch (err: any) {
      setState({
        data: null,
        loading: false,
        error: err?.message || 'Unable to connect to MediRoute API',
        lastChecked: new Date(),
      });
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return { ...state, refetch: fetchHealth };
};
