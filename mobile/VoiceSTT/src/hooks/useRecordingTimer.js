import { useState, useRef, useEffect } from 'react';

/**
 * Counts elapsed seconds while `active` is true.
 * Resets to 0 whenever active becomes true.
 *
 * @param {boolean} active
 * @returns {number} elapsed seconds
 */
export function useRecordingTimer(active) {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (active) {
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [active]);

  return seconds;
}
