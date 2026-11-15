import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

export default function StudySwipeCard({ children, onKnown }: { children: ReactNode; onKnown: () => void }) {
  const [offset] = useState(() => new Animated.Value(0));
  const [badgeOpacity] = useState(() => new Animated.Value(0));
  const [confirming, setConfirming] = useState(false);
  const width = useRef(0);
  const live = useRef(false);
  const phase = useRef<'idle' | 'dragging' | 'confirming' | 'done'>('idle');
  const generation = useRef(0);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const known = useRef(onKnown);
  useLayoutEffect(() => { known.current = onKnown; }, [onKnown]);
  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      // This counter deliberately invalidates the latest callback, not a rendered node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      animation.current?.stop();
      offset.stopAnimation();
      badgeOpacity.stopAnimation();
    };
  }, [offset, badgeOpacity]);

  const responder = useMemo(() => {
    const threshold = () => Math.max(64, Math.min(96, width.current * 0.22));
    const reset = () => {
      generation.current++;
      animation.current?.stop();
      phase.current = 'idle';
      if (!live.current) return;
      setConfirming(false);
      badgeOpacity.setValue(0);
      animation.current = Animated.spring(offset, { toValue: 0, useNativeDriver: true });
      animation.current.start();
    };
    const shouldCapture = (_: unknown, gesture: { dx: number; dy: number; numberActiveTouches: number }) => live.current
      && phase.current !== 'confirming' && phase.current !== 'done'
      && gesture.numberActiveTouches === 1
      && gesture.dx > 10 && gesture.dx > Math.abs(gesture.dy) * 1.4;
    // PanResponder stores these callbacks; refs are only read/written by gesture events.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      // Leave taps to the pronunciation/reveal controls and vertical drags to ScrollView.
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: shouldCapture,
      onMoveShouldSetPanResponderCapture: shouldCapture,
      onPanResponderGrant: () => {
        if (!live.current || phase.current === 'confirming' || phase.current === 'done') return;
        generation.current++;
        animation.current?.stop();
        offset.stopAnimation();
        phase.current = 'dragging';
      },
      onPanResponderStart: (_, gesture) => {
        if (gesture.numberActiveTouches > 1 && phase.current === 'dragging') reset();
      },
      onPanResponderMove: (_, gesture) => {
        if (!live.current || phase.current !== 'dragging') return;
        if (gesture.numberActiveTouches > 1) { reset(); return; }
        offset.setValue(Math.max(0, gesture.dx));
        badgeOpacity.setValue(Math.max(0, Math.min(1, gesture.dx / threshold())));
      },
      onPanResponderRelease: (_, gesture) => {
        if (!live.current || phase.current !== 'dragging') return;
        const horizontal = gesture.dx > 0 && gesture.dx > Math.abs(gesture.dy) * 1.4;
        const fling = gesture.dx >= 32 && gesture.vx >= 0.55 && gesture.vx > Math.abs(gesture.vy) * 1.2;
        if (gesture.numberActiveTouches > 1 || !horizontal || (gesture.dx < threshold() && !fling)) {
          reset();
          return;
        }
        phase.current = 'confirming';
        const ticket = ++generation.current;
        setConfirming(true);
        badgeOpacity.setValue(1);
        // Keep confirmation readable before sliding beyond the measured card edge.
        animation.current = Animated.sequence([
          Animated.delay(180),
          Animated.timing(offset, { toValue: Math.max(width.current, gesture.dx) + 48, duration: 220, useNativeDriver: true }),
        ]);
        animation.current.start(({ finished }) => {
          if (!live.current || generation.current !== ticket || phase.current !== 'confirming') return;
          if (!finished) { reset(); return; }
          phase.current = 'done';
          known.current();
        });
      },
      onPanResponderTerminate: reset,
      onPanResponderTerminationRequest: () => phase.current !== 'dragging',
    });
  }, [offset, badgeOpacity]);

  return (
    <View style={styles.container} onLayout={event => { width.current = event.nativeEvent.layout.width; }} {...responder.panHandlers}>
      <Animated.View style={[styles.card, { transform: [{ translateX: offset }] }]}>
        {children}
      </Animated.View>
      <Animated.View pointerEvents="none" aria-hidden={!confirming} accessibilityElementsHidden={!confirming} importantForAccessibility={confirming ? 'auto' : 'no-hide-descendants'} style={[styles.badge, { opacity: badgeOpacity }]}>
        <Text accessibilityLiveRegion="polite" style={styles.badgeText}>{confirming ? '✓ 외웠어요' : '외웠어요 →'}</Text>
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
