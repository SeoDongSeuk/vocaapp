import { fetchTenpingAds, type TenpingAd } from './tenping';
import { fetchAdpickAds } from './adpick';
import { fetchShoppingDeals, fetchShoppingRecommendations } from './shopping';

export type CampaignProvider = 'tenping' | 'adpick' | 'shopping' | 'recommendations';
export type CampaignAd = TenpingAd & { imageKind?: 'icon' | 'banner' | 'product'; salePrice?: number | null; originalPrice?: number | null };
export type CampaignSnapshot = { ads: CampaignAd[]; status: 'idle' | 'loading' | 'ready' | 'error'; error: string };
type Entry = CampaignSnapshot & { lastAttempt: number | null; pending?: Promise<CampaignSnapshot> };

export const CAMPAIGN_REFRESH_MS = 3 * 60 * 1000;
const entries = new Map<CampaignProvider, Entry>();
const loaders = { tenping: fetchTenpingAds, adpick: fetchAdpickAds, shopping: fetchShoppingDeals, recommendations: fetchShoppingRecommendations };

function entryFor(provider: CampaignProvider): Entry {
  let entry = entries.get(provider);
  if (!entry) {
    entry = { ads: [], status: 'idle', error: '', lastAttempt: null };
    entries.set(provider, entry);
  }
  return entry;
}

export function getCampaignSnapshot(provider: CampaignProvider): CampaignSnapshot {
  const { ads, status, error } = entryFor(provider);
  return { ads, status, error };
}

/** Called only when entering a card. No periodic refresh timer; errors are throttled too. */
export function refreshCampaignOnEntry(provider: CampaignProvider, now = Date.now()): Promise<CampaignSnapshot> {
  const entry = entryFor(provider);
  if (entry.pending) return entry.pending;
  if (entry.lastAttempt !== null && now - entry.lastAttempt < CAMPAIGN_REFRESH_MS) return Promise.resolve(getCampaignSnapshot(provider));
  entry.lastAttempt = now;
  entry.status = 'loading';
  entry.error = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  entry.pending = Promise.resolve().then(() => loaders[provider](controller.signal)).then(ads => {
    entry.ads = ads;
    entry.status = 'ready';
  }).catch((cause: unknown) => {
    entry.status = 'error';
    entry.error = controller.signal.aborted ? '연결 시간이 초과되었습니다.' : cause instanceof Error && cause.name !== 'TypeError' ? cause.message : '목록을 불러오지 못했습니다. 네트워크를 확인해 주세요.';
  }).then(() => getCampaignSnapshot(provider)).finally(() => {
    clearTimeout(timeout);
    entry.pending = undefined;
  });
  return entry.pending;
}
