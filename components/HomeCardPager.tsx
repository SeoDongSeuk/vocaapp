import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TenpingAdList from './TenpingAdList';

export default function HomeCardPager({ children }: { children: ReactNode }) {
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const currentPage = useRef(0);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [visitedAds, setVisitedAds] = useState(false);
  const returnToStudy = () => pager.current?.scrollTo({ x: 0, animated: true });
  return <SafeAreaView edges={['bottom']} style={styles.container}>
    <View style={styles.hint} accessibilityLiveRegion="polite">
      <Text style={styles.hintText}>{page === 0 ? '옆으로 밀면 광고 목록을 볼 수 있어요 →' : '← 옆으로 밀면 학습 단계로 돌아가요'}</Text>
      <View style={styles.dots}><View style={[styles.dot, page === 0 && styles.active]} /><View style={[styles.dot, page === 1 && styles.active]} /></View>
    </View>
    <View style={styles.container} onLayout={event => {
      const next = event.nativeEvent.layout.width;
      if (next !== width) {
        setWidth(next);
        requestAnimationFrame(() => pager.current?.scrollTo({ x: currentPage.current * next, animated: false }));
      }
    }}>
      {width > 0 && <ScrollView ref={pager} testID="home-card-pager" style={styles.container} horizontal pagingEnabled directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={32}
        onScroll={event => {
          const next = Math.max(0, Math.min(1, Math.round(event.nativeEvent.contentOffset.x / width)));
          currentPage.current = next;
          setPage(next);
          if (next === 1) setVisitedAds(true);
        }}>
        <View style={{ width, height: '100%' }} accessibilityElementsHidden={page !== 0} importantForAccessibility={page === 0 ? 'auto' : 'no-hide-descendants'}>{children}</View>
        <View style={{ width, height: '100%' }} accessibilityElementsHidden={page !== 1} importantForAccessibility={page === 1 ? 'auto' : 'no-hide-descendants'}>{visitedAds && <TenpingAdList embedded active={page === 1} onBack={returnToStudy} />}</View>
      </ScrollView>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  hint: { alignItems: 'center', gap: 9, paddingTop: 4, paddingBottom: 12 },
  hintText: { fontSize: 11, color: '#89869D' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#DAD5EB' },
  active: { width: 20, backgroundColor: '#6E5AE6' },
});
