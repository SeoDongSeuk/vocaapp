import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchTenpingAds, type TenpingAd } from '../services/tenping';

function AdCard({ ad }: { ad: TenpingAd }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [linkError, setLinkError] = useState('');
  async function openAd() {
    if (!ad.link) return;
    try { await Linking.openURL(ad.link); setLinkError(''); }
    catch { setLinkError('광고 페이지를 열지 못했습니다. 다시 시도해 주세요.'); }
  }
  return <View style={styles.card}>
    {ad.imageUrl && !imageFailed ? <Image source={{ uri: ad.imageUrl }} style={styles.image} resizeMode="cover" accessibilityLabel={ad.title} onError={() => setImageFailed(true)} /> : <View style={[styles.image, styles.placeholder]}><Text style={styles.muted}>광고 이미지</Text></View>}
    <View style={styles.cardBody}>
      <Text style={styles.badge}>광고 · 텐핑{ad.category ? ` · ${ad.category}` : ''}</Text>
      <Text style={styles.title}>{ad.title}</Text>
      {!!ad.description && <Text style={styles.description}>{ad.description}</Text>}
      <Pressable accessibilityRole="link" disabled={!ad.link} onPress={openAd} style={[styles.button, !ad.link && styles.disabled]}><Text style={styles.buttonText}>{ad.link ? '광고 자세히 보기 ↗' : '연결 주소가 없는 광고입니다'}</Text></Pressable>
      {!!linkError && <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text>}
    </View>
  </View>;
}

export default function TenpingAdList({ onBack, embedded = false, active = true }: { onBack: () => void; embedded?: boolean; active?: boolean }) {
  const [ads, setAds] = useState<TenpingAd[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack, active]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    void fetchTenpingAds(controller.signal).then(items => {
      if (active) { setAds(items); setStatus('ready'); }
    }).catch((cause: unknown) => {
      if (active) {
        const message = cause instanceof Error && cause.name !== 'TypeError' ? cause.message : '광고 서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.';
        setError(controller.signal.aborted ? '연결 시간이 초과되었습니다. 네트워크를 확인해 주세요.' : message);
        setStatus('error');
      }
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [request]);
  function reload() { setError(''); setStatus('loading'); setRequest(value => value + 1); }
  return <SafeAreaView edges={embedded ? [] : ['bottom']} style={[styles.screen, embedded && styles.embedded]}>
    <View style={styles.header}>{!embedded && <Pressable accessibilityRole="button" accessibilityLabel="학습 홈으로 돌아가기" onPress={onBack} hitSlop={12}><Text style={styles.back}>‹ 홈으로</Text></Pressable>}<Text style={styles.heading}>광고 목록</Text><Pressable accessibilityRole="button" onPress={reload} disabled={status === 'loading'}><Text style={styles.back}>새로고침</Text></Pressable></View>
    <Text style={styles.notice}>텐핑에서 제공하는 광고입니다. 자세히 보기는 외부 페이지로 연결됩니다.</Text>
    {status === 'loading' && ads.length === 0 ? <View style={styles.center}><ActivityIndicator size="large" color="#6E5AE6" /><Text style={styles.muted}>광고를 불러오는 중이에요</Text></View> :
      <FlatList<TenpingAd> nestedScrollEnabled data={ads} keyExtractor={ad => ad.id} renderItem={({ item }: { item: TenpingAd }) => <AdCard ad={item} />} contentContainerStyle={styles.list} refreshing={status === 'loading'} onRefresh={reload}
        ListHeaderComponent={status === 'error' ? <View style={styles.state}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable onPress={reload} style={styles.button}><Text style={styles.buttonText}>다시 시도</Text></Pressable></View> : null}
        ListEmptyComponent={status === 'ready' ? <View style={styles.state}><Text style={styles.muted}>현재 표시할 광고가 없습니다.</Text></View> : null} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: 54 },
  embedded: { paddingTop: 10 },
  header: { paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { fontSize: 20, fontWeight: '900', color: '#24213A' },
  back: { fontSize: 13, fontWeight: '700', color: '#6E5AE6' },
  notice: { fontSize: 12, lineHeight: 18, color: '#777185', paddingHorizontal: 22, marginVertical: 18 },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  card: { borderRadius: 20, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: '#EAE8F1' },
  image: { width: '100%', aspectRatio: 1.5, backgroundColor: '#ECE9FF' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 18, gap: 12 },
  badge: { fontSize: 11, fontWeight: '700', color: '#6E5AE6' },
  title: { fontSize: 18, fontWeight: '800', lineHeight: 26, color: '#24213A' },
  description: { fontSize: 13, lineHeight: 21, color: '#625D70' },
  button: { backgroundColor: '#6E5AE6', borderRadius: 12, minHeight: 44, padding: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: '#AD3E3E', fontSize: 13, lineHeight: 20 },
  muted: { color: '#777185', fontSize: 13, marginTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  state: { paddingVertical: 24, gap: 16 },
});
