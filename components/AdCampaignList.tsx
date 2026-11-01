import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCampaignSnapshot, refreshCampaignOnEntry, type CampaignAd, type CampaignProvider } from '../services/campaignCache';

function AdCard({ ad, providerLabel }: { ad: CampaignAd; providerLabel: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [linkError, setLinkError] = useState('');
  async function openAd() {
    if (!ad.link) return;
    try { await Linking.openURL(ad.link); setLinkError(''); }
    catch { setLinkError('광고 페이지를 열지 못했습니다. 다시 시도해 주세요.'); }
  }
  return <View style={styles.card}>
    {ad.imageUrl && !imageFailed ? <View style={[styles.image, ad.imageKind === 'icon' && styles.iconFrame, ad.imageKind === 'product' && styles.productFrame]}><Image source={{ uri: ad.imageUrl }} style={ad.imageKind === 'icon' ? styles.appIcon : styles.fillImage} resizeMode={ad.imageKind === 'banner' || !ad.imageKind ? 'cover' : 'contain'} accessibilityLabel={ad.title} onError={() => setImageFailed(true)} /></View> : <View style={[styles.image, styles.placeholder]}><Text style={styles.muted}>광고 이미지</Text></View>}
    <View style={styles.cardBody}>
      <Text style={styles.badge}>광고 · {providerLabel}{ad.category ? ` · ${ad.category}` : ''}</Text>
      <Text style={styles.title}>{ad.title}</Text>
      {ad.imageKind === 'product' && <View style={styles.prices}>
        {ad.salePrice != null && ad.salePrice > 0 ? <Text style={styles.salePrice}>{ad.salePrice.toLocaleString('ko-KR')}원</Text> : <Text style={styles.muted}>가격은 판매처에서 확인해 주세요</Text>}
        {ad.salePrice != null && ad.salePrice > 0 && ad.originalPrice != null && ad.originalPrice > ad.salePrice && <Text style={styles.originalPrice}>{ad.originalPrice.toLocaleString('ko-KR')}원</Text>}
      </View>}
      {!!ad.description && <Text style={styles.description}>{ad.description}</Text>}
      <Pressable accessibilityRole="link" disabled={!ad.link} onPress={openAd} style={[styles.button, !ad.link && styles.disabled]}><Text style={styles.buttonText}>{ad.link ? ad.imageKind === 'product' ? '상품 보러 가기 ↗' : '광고 자세히 보기 ↗' : '연결 주소가 없는 광고입니다'}</Text></Pressable>
      {!!linkError && <Text accessibilityRole="alert" style={styles.error}>{linkError}</Text>}
    </View>
  </View>;
}

export default function AdCampaignList({ onBack, provider = 'tenping', embedded = false, active = true }: { onBack: () => void; provider?: CampaignProvider; embedded?: boolean; active?: boolean }) {
  const isShopping = provider === 'shopping' || provider === 'recommendations';
  const providerLabel = isShopping ? '애드픽 쇼핑' : provider === 'adpick' ? '애드픽' : '텐핑';
  const [snapshot, setSnapshot] = useState(() => getCampaignSnapshot(provider));
  const { ads, status, error } = snapshot;
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack, active]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const request = refreshCampaignOnEntry(provider);
    void Promise.resolve().then(() => { if (live) setSnapshot(getCampaignSnapshot(provider)); });
    void request.then(result => { if (live) setSnapshot(result); });
    return () => { live = false; };
  }, [active, provider]);
  return <SafeAreaView edges={embedded ? [] : ['bottom']} style={[styles.screen, embedded && styles.embedded]}>
    <View style={styles.header}>{!embedded && <Pressable accessibilityRole="button" accessibilityLabel="학습 홈으로 돌아가기" onPress={onBack} hitSlop={12}><Text style={styles.back}>‹ 홈으로</Text></Pressable>}<Text style={styles.heading}>{provider === 'shopping' ? '쇼핑 핫딜' : provider === 'recommendations' ? '쇼핑 추천상품' : `${providerLabel} 광고`}</Text>{status === 'loading' && ads.length > 0 && <ActivityIndicator color="#6E5AE6" />}</View>
    {(status === 'idle' || status === 'loading') && ads.length === 0 ? <View style={styles.center}><ActivityIndicator size="large" color="#6E5AE6" /><Text style={styles.muted}>목록을 불러오는 중이에요</Text></View> :
      <FlatList<CampaignAd> nestedScrollEnabled data={ads} keyExtractor={ad => ad.id} renderItem={({ item }: { item: CampaignAd }) => <AdCard ad={item} providerLabel={providerLabel} />} contentContainerStyle={styles.list}
        ListHeaderComponent={status === 'error' ? <View style={styles.state}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></View> : null}
        ListEmptyComponent={status === 'ready' ? <View style={styles.state}><Text style={styles.muted}>{isShopping ? '현재 표시할 상품이 없습니다.' : '현재 표시할 광고가 없습니다.'}</Text></View> : null} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: 54 },
  embedded: { paddingTop: 10 },
  header: { paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { fontSize: 20, fontWeight: '900', color: '#24213A' },
  back: { fontSize: 13, fontWeight: '700', color: '#6E5AE6' },
  list: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, gap: 16 },
  card: { borderRadius: 20, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: '#EAE8F1' },
  image: { width: '100%', aspectRatio: 1.5, backgroundColor: '#ECE9FF' },
  fillImage: { width: '100%', height: '100%' },
  iconFrame: { alignItems: 'center', justifyContent: 'center' },
  appIcon: { width: 110, height: 110, borderRadius: 22 },
  productFrame: { aspectRatio: 1, backgroundColor: '#FFFFFF' },
  prices: { gap: 4 },
  salePrice: { fontSize: 23, fontWeight: '900', color: '#5745CB' },
  originalPrice: { fontSize: 13, color: '#89869D', textDecorationLine: 'line-through' },
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
