export type AdMobAds = {
  showCompletionAd: (completionKey: string) => boolean;
  privacyOptionsRequired: boolean;
  privacyOptionsBusy: boolean;
  showPrivacyOptions: () => Promise<void>;
};
