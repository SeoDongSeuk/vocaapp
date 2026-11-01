import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

export default function StudySwipeCard({ children, onKnown }: { children: ReactNode; onKnown: () => void }) {
  const [offset] = useState(() => new Animated.Value(0));
  const committed = useRef(false);
  useEffect(() => () => offset.stopAnimation(), [offset]);
  const responder = useMemo(() => {
    const reset = () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
    // PanResponder stores these callbacks; refs are only read/written by gesture events.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) => !committed.current
        && gesture.dx > 15 && gesture.dx > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, gesture.dx)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < 90 || gesture.dx <= Math.abs(gesture.dy) * 1.5) {
          reset();
          return;
        }
        if (committed.current) return;
        committed.current = true;
        Animated.timing(offset, { toValue: 360, duration: 230, useNativeDriver: true }).start(({ finished }) => {
          if (finished) onKnown();
        });
      },
      onPanResponderTerminate: reset,
      onPanResponderTerminationRequest: () => false,
    });
  }, [offset, onKnown]);

  return (
    <View style={styles.container} {...responder.panHandlers}>
      <Animated.View style={[styles.card, { transform: [{ translateX: offset }] }]}>
        {children}
        <Animated.View pointerEvents="none" style={[styles.badge, {
          opacity: offset.interpolate({ inputRange: [0, 60, 90], outputRange: [0, 0.7, 1], extrapolate: 'clamp' }),
        }]}>
          <Text style={styles.badgeText}>✓ 외웠어요</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, marginTop: 19, marginBottom: 14 },
  card: { flex: 1 },
  badge: { position: 'absolute', top: 16, left: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: '#21845A', backgroundColor: '#EAF8F0' },
  badgeText: { color: '#21845A', fontSize: 20, fontWeight: '900' },
});
