import type { AdMobAds } from './admobTypes';

const unavailableAds: AdMobAds = {
  showCompletionAd: () => false,
  privacyOptionsRequired: false,
  privacyOptionsBusy: false,
  showPrivacyOptions: async () => undefined,
};

// Web never imports the native Google Mobile Ads package.
export default function useAdMobAds(): AdMobAds {
  return unavailableAds;
}
