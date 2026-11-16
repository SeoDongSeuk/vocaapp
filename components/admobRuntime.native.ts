import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useNetworkState } from 'expo-network';

export type GoogleMobileAds = typeof import('react-native-google-mobile-ads');
type ConsentInfo = Awaited<ReturnType<GoogleMobileAds['AdsConsent']['getConsentInfo']>>;
type AdFormat = 'banner' | 'interstitial';

export type AdMobSnapshot = {
  adsModule: GoogleMobileAds | null;
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
  privacyOptionsBusy: boolean;
  consentVersion: number;
};

let snapshot: AdMobSnapshot = {
  adsModule: null, canRequestAds: false, privacyOptionsRequired: false,
  privacyOptionsBusy: false, consentVersion: 0,
};
const subscribers = new Set<() => void>();
let modulePromise: Promise<GoogleMobileAds | null> | null = null;
let initialization: Promise<unknown> | null = null;
let preparation: Promise<GoogleMobileAds | null> | null = null;
let privacyForm: Promise<void> | null = null;
let consentGathered = false;

export const useAdMobTestIds = __DEV__ || process.env.EXPO_PUBLIC_ADMOB_TEST_ADS === '1';

function configuredUnitId(format: AdFormat): string | null {
  const value = Platform.OS === 'android'
    ? (format === 'banner' ? process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID)
    : Platform.OS === 'ios'
      ? (format === 'banner' ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID : process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID)
      : undefined;
  const id = value?.trim();
  // App IDs contain '~'; ad unit IDs contain '/'. Never silently ship sample inventory.
  return id && /^ca-app-pub-\d{16}\/\d{10}$/.test(id) && !id.startsWith('ca-app-pub-3940256099942544/') ? id : null;
}

export function getAdMobUnitId(format: AdFormat, module: GoogleMobileAds): string | null {
  if (useAdMobTestIds) return format === 'banner' ? module.TestIds.BANNER : module.TestIds.INTERSTITIAL;
  return configuredUnitId(format);
}

function supported() {
  return (Platform.OS === 'android' || Platform.OS === 'ios') && Constants.expoGoConfig == null
    && (useAdMobTestIds || configuredUnitId('banner') != null || configuredUnitId('interstitial') != null);
}

function publish(update: Partial<AdMobSnapshot>) {
  snapshot = { ...snapshot, ...update };
  for (const listener of subscribers) listener();
}

export function getAdMobSnapshot(): AdMobSnapshot { return snapshot; }
export function subscribeAdMobRuntime(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

async function loadModule(): Promise<GoogleMobileAds | null> {
  if (!supported()) return null;
  modulePromise ??= import('react-native-google-mobile-ads').catch(() => null);
  return modulePromise;
}

function publishConsent(module: GoogleMobileAds, info: ConsentInfo) {
  publish({
    canRequestAds: info.canRequestAds,
    privacyOptionsRequired: info.privacyOptionsRequirementStatus === module.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
  });
}

export async function prepareAdMobRuntime(): Promise<GoogleMobileAds | null> {
  if (!supported() || AppState.currentState !== 'active') return null;
  if (snapshot.adsModule && snapshot.canRequestAds && !snapshot.privacyOptionsBusy) return snapshot.adsModule;
  if (preparation) return preparation;
  preparation = (async () => {
    const module = await loadModule();
    if (!module || AppState.currentState !== 'active' || snapshot.privacyOptionsBusy) return null;
    if (!consentGathered) {
      try {
        await module.AdsConsent.gatherConsent();
        consentGathered = true;
      } catch {
        // UMP can still allow requests from a valid previous-session decision.
      }
    }
    const info = await module.AdsConsent.getConsentInfo();
    publishConsent(module, info);
    if (!info.canRequestAds || AppState.currentState !== 'active' || snapshot.privacyOptionsBusy) return null;
    initialization ??= Promise.resolve().then(() => module.default().initialize()).catch(error => {
      initialization = null;
      throw error;
    });
    await initialization;
    if (!snapshot.canRequestAds || snapshot.privacyOptionsBusy) return null;
    publish({ adsModule: module });
    return module;
  })().catch(() => null).finally(() => { preparation = null; });
  return preparation;
}

export async function openAdMobPrivacyOptions(): Promise<void> {
  if (privacyForm) return privacyForm;
  if (!snapshot.privacyOptionsRequired || AppState.currentState !== 'active') return;
  privacyForm = (async () => {
    const module = await loadModule();
    if (!module || AppState.currentState !== 'active') return;
    // Retire held ads before changing the consent signals used by new requests.
    publish({ privacyOptionsBusy: true, canRequestAds: false, consentVersion: snapshot.consentVersion + 1 });
    try {
      await module.AdsConsent.showPrivacyOptionsForm();
    } catch {
      // Dismissal/loading failure keeps the app usable and retains UMP's latest valid choice.
    } finally {
      try {
        const info = await module.AdsConsent.getConsentInfo();
        publishConsent(module, info);
      } catch {
        publish({ canRequestAds: false });
      }
      publish({ privacyOptionsBusy: false });
      await prepareAdMobRuntime();
    }
  })().finally(() => { privacyForm = null; });
  return privacyForm;
}

export function useAdMobRuntime() {
  const network = useNetworkState();
  const online = network.isConnected === true && network.isInternetReachable === true;
  const [active, setActive] = useState(AppState.currentState === 'active');
  const state = useSyncExternalStore(subscribeAdMobRuntime, getAdMobSnapshot, getAdMobSnapshot);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (online && active) void prepareAdMobRuntime();
  }, [online, active]);

  return { ...state, online, active };
}
