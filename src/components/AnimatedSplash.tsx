import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

type Props = {
  onFinish: () => void;
  // Resolves once the app's core data (restaurants, characters) is warm in
  // cache — see src/lib/prefetchCache.ts. The splash stays up until this
  // resolves (or a floor elapses, so a same-tick cache hit doesn't skip the
  // animation entirely), so Directory/Home paint with real data underneath
  // instead of showing their own separate loading spinner right after this.
  ready: Promise<void>;
};

const RED = '#D8342B';
const WHITE = '#FFFFFF';

export default function AnimatedSplash({ onFinish, ready }: Props) {
  const translateY = useRef(new Animated.Value(24)).current;
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const colorProgress = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (cancelled) return;

      // Creeps toward "almost done" while actually waiting — never
      // promises 100% on its own, so a slow load never looks stuck at a
      // full white logo that then hangs. Real completion always finishes
      // it the rest of the way instead.
      Animated.timing(colorProgress, {
        toValue: 0.85,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();

      const floor = new Promise<void>((resolve) => setTimeout(resolve, 900));

      Promise.all([ready, floor]).then(() => {
        if (cancelled) return;
        Animated.timing(colorProgress, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start(() => {
          if (cancelled) return;
          Animated.sequence([
            Animated.delay(250),
            Animated.timing(containerOpacity, {
              toValue: 0,
              duration: 350,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start(() => onFinish());
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const color = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RED, WHITE],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Animated.Text
        style={[
          styles.logoText,
          {
            color,
            opacity: entranceOpacity,
            transform: [{ translateY }],
          },
        ]}
      >
        Foodlings
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: RED,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  logoText: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
