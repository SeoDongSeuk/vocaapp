import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AdMobAds } from './admobTypes';
import { getAdMobUnitId, openAdMobPrivacyOptions, useAdMobRuntime, type GoogleMobileAds } from './admobRuntime.native';

type HeldAd = {
  ad: ReturnType<GoogleMobileAds['InterstitialAd']['createForAdRequest']>;
  unsubscribe: (() => void)[];
  ready: boolean;
  showing: boolean;
  retired: boolean;
  loadedAt: number;
  consentVersion: number;
};
const MAX_AD_AGE = 55 * 60 * 1000;

function dispose(record: HeldAd) {
  if (record.retired) return;
  record.retired = true;
  for (const unsubscribe of record.unsubscribe) unsubscribe();
  try { record.ad.destroy(); } catch { /* Native teardown must never close the learning app. */ }
}

export default function useAdMobAds(): AdMobAds {
  const runtime = useAdMobRuntime();
  const { adsModule, online, active, canRequestAds, privacyOptionsBusy, consentVersion } = runtime;
  const held = useRef<HeldAd | null>(null);
  const live = useRef(false);
  const consumed = useRef(new Set<string>());
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const latest = useRef(runtime);
  const [revision, setRevision] = useState(0);

  useLayoutEffect(() => { latest.current = runtime; }, [runtime]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (retry.current) clearTimeout(retry.current);
      if (held.current) dispose(held.current);
      held.current = null;
    };
  }, []);

  const requestRetry = useCallback(() => {
    if (retry.current || !live.current) return;
    const delay = Math.min(60_000 * 2 ** Math.min(failures.current++, 3), 300_000);
    retry.current = setTimeout(() => {
      retry.current = null;
      if (live.current) setRevision(value => value + 1);
    }, delay);
  }, []);

  useEffect(() => {
    const eligible = online && active && canRequestAds && !privacyOptionsBusy && adsModule != null;
    const previous = held.current;
    // Google's fullscreen AdActivity legitimately backgrounds MainActivity. Preserve showing inventory.
    if (previous?.showing) return;
    if (!eligible) {
      if (retry.current) clearTimeout(retry.current);
      retry.current = null;
      if (previous) dispose(previous);
      held.current = null;
      return;
    }
    if (previous && previous.consentVersion === consentVersion) return;
    if (previous) dispose(previous);
    held.current = null;
    const unitId = getAdMobUnitId('interstitial', adsModule);
    if (!unitId) return;
    let record: HeldAd | null = null;
    try {
      const ad = adsModule.InterstitialAd.createForAdRequest(unitId);
      record = { ad, unsubscribe: [], ready: false, showing: false, retired: false, loadedAt: 0, consentVersion };
      held.current = record;
      const current = record;
      const valid = () => live.current && held.current === current && !current.retired;
      const failed = () => {
        if (!valid()) return;
        dispose(current);
        held.current = null;
        requestRetry();
      };
      current.unsubscribe = [
        ad.addAdEventListener(adsModule.AdEventType.LOADED, () => {
          if (!valid()) return;
          current.ready = true;
          current.loadedAt = Date.now();
          failures.current = 0;
        }),
        ad.addAdEventListener(adsModule.AdEventType.ERROR, failed),
        ad.addAdEventListener(adsModule.AdEventType.CLOSED, () => {
          if (!valid()) return;
          dispose(current);
          held.current = null;
          setRevision(value => value + 1);
        }),
      ];
      ad.load();
    } catch {
      if (record) dispose(record);
      held.current = null;
      requestRetry();
    }
  }, [adsModule, online, active, canRequestAds, privacyOptionsBusy, consentVersion, revision, requestRetry]);

  const showCompletionAd = useCallback((completionKey: string) => {
    if (consumed.current.has(completionKey)) return false;
    consumed.current.add(completionKey);
    const state = latest.current;
    const record = held.current;
    if (!live.current || !state.online || !state.active || AppState.currentState !== 'active'
      || !state.canRequestAds || state.privacyOptionsBusy || !record || !record.ready || record.showing || record.retired) return false;
    if (Date.now() - record.loadedAt >= MAX_AD_AGE) {
      dispose(record);
      held.current = null;
      setRevision(value => value + 1);
      return false;
    }
    record.ready = false;
    record.showing = true;
    const failed = () => {
      if (!live.current || held.current !== record || record.retired) return;
      dispose(record);
      held.current = null;
      requestRetry();
    };
    try {
      void record.ad.show().catch(failed);
      return true;
    } catch {
      failed();
      return false;
    }
  }, [requestRetry]);

  const showPrivacyOptions = useCallback(async () => {
    if (latest.current.online && AppState.currentState === 'active') await openAdMobPrivacyOptions();
  }, []);

  return {
    showCompletionAd,
    privacyOptionsRequired: runtime.privacyOptionsRequired,
    privacyOptionsBusy: runtime.privacyOptionsBusy,
    showPrivacyOptions,
  };
}
