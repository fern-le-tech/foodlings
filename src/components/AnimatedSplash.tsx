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

export default function AnimatedSplash({ onFinish, ready }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;

    // Creeps toward "almost done" while actually waiting — never promises
    // 100% on its own, so a slow load never looks stuck at a full bar that
    // then hangs. Real completion always finishes it the rest of the way.
    Animated.timing(progress, {
      toValue: 0.85,
      duration: 1800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    const floor = new Promise<void>((resolve) => setTimeout(resolve, 900));

    Promise.all([ready, floor]).then(() => {
      if (cancelled) return;
      Animated.timing(progress, {
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
            useNativeDriver: false,
          }),
        ]).start(() => onFinish());
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Text style={styles.logoText}>Foodlings</Text>

      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth }]} />
      </View>
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
    color: '#FFFFFF',
  },
  barTrack: {
    position: 'absolute',
    bottom: 64,
    left: 48,
    right: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});
