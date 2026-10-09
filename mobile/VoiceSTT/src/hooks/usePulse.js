import { useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Provides scale + opacity Animated values that loop-pulse when `active` is true.
 * Used for the recording ring indicator.
 *
 * @param {boolean} active
 * @returns {{ scale: Animated.Value, opacity: Animated.Value }}
 */
export function usePulse(active) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale,   { toValue: 1.2, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale,   { toValue: 1,   duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1,   duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      scale.setValue(1);
      opacity.setValue(1);
    }
  }, [active]);

  return { scale, opacity };
}
