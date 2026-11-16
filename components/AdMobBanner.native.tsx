import { Component, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { getAdMobUnitId, useAdMobRuntime, type GoogleMobileAds } from './admobRuntime.native';

class BannerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function AdMobBanner() {
  const runtime = useAdMobRuntime();
  const { width } = useWindowDimensions();
  const { adsModule } = runtime;
  if (!runtime.online || !runtime.active || !runtime.canRequestAds || runtime.privacyOptionsBusy || !adsModule || width < 320) return null;
  const unitId = getAdMobUnitId('banner', adsModule);
  if (!unitId) return null;

  return <BannerBoundary key={`${runtime.consentVersion}:${width}`}>
    <BannerSlot adsModule={adsModule} unitId={unitId} width={width} />
  </BannerBoundary>;
}

function BannerSlot({ adsModule, unitId, width }: { adsModule: GoogleMobileAds; unitId: string; width: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const { BannerAd, BannerAdSize } = adsModule;

  return (
    <View style={[styles.adSlot, { paddingHorizontal: width >= 336 ? 8 : 0 }]} testID="admob-bottom-banner">
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  adSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#EAE8F1',
    backgroundColor: '#FFFFFF',
  },
});
