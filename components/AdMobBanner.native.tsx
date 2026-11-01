import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

type GoogleMobileAds = typeof import('react-native-google-mobile-ads');

const isExpoGo = Constants.expoGoConfig != null;

let adsInitialization: Promise<unknown> | null = null;
let cachedAdsModule: GoogleMobileAds | null | undefined;

function loadGoogleMobileAds(): GoogleMobileAds | null {
  if (cachedAdsModule !== undefined) return cachedAdsModule;

  try {
    cachedAdsModule = require('react-native-google-mobile-ads') as GoogleMobileAds;
  } catch {
    // Expo Go does not include this native module. Keep the app usable without ads there.
    cachedAdsModule = null;
  }

  return cachedAdsModule;
}

export default function AdMobBanner() {
  const [adsModule, setAdsModule] = useState<GoogleMobileAds | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!__DEV__ || isExpoGo) return;

    const module = loadGoogleMobileAds();
    if (!module) return;
    setAdsModule(module);

    let isMounted = true;
    adsInitialization ??= module.default().initialize().catch((error: unknown) => {
      console.warn('AdMob SDK initialization failed:', error);
      adsInitialization = null;
      throw error;
    });

    void adsInitialization.then(() => {
      if (isMounted) setIsReady(true);
    }).catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  if (!__DEV__ || isExpoGo || !isReady || !adsModule) return null;

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
