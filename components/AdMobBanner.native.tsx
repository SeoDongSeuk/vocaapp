import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useNetworkState } from 'expo-network';

type GoogleMobileAds = typeof import('react-native-google-mobile-ads');

const isExpoGo = Constants.expoGoConfig != null;

let adsInitialization: Promise<unknown> | null = null;
let cachedAdsModule: GoogleMobileAds | null | undefined;

async function loadGoogleMobileAds(): Promise<GoogleMobileAds | null> {
  if (cachedAdsModule !== undefined) return cachedAdsModule;

  try {
    cachedAdsModule = await import('react-native-google-mobile-ads');
  } catch {
    // Expo Go does not include this native module. Keep the app usable without ads there.
    cachedAdsModule = null;
  }

  return cachedAdsModule;
}

export default function AdMobBanner() {
  const network = useNetworkState();
  const online = network.isConnected === true && network.isInternetReachable === true;
  const [adsModule, setAdsModule] = useState<GoogleMobileAds | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!__DEV__ || isExpoGo || !online) return;

    let isMounted = true;
    void loadGoogleMobileAds().then(async (module) => {
      if (!module || !isMounted) return;
      adsInitialization ??= module.default().initialize().catch((error: unknown) => {
        console.warn('AdMob SDK initialization failed:', error);
        adsInitialization = null;
        throw error;
      });
      await adsInitialization;
      if (isMounted) {
        setAdsModule(module);
        setIsReady(true);
      }
    }).catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [online]);

  if (!__DEV__ || isExpoGo || !online || !isReady || !adsModule) return null;

  const { BannerAd, BannerAdSize, TestIds } = adsModule;

  return (
    <View style={styles.adSlot}>
      <BannerAd
        unitId={TestIds.BANNER}
        size={BannerAdSize.BANNER}
        onAdFailedToLoad={(error) => console.warn('AdMob test banner failed to load:', error)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  adSlot: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#EAE8F1',
    backgroundColor: '#FFFFFF',
  },
});
