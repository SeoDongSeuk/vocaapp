import type { TenpingAd } from './tenping';

declare const process: { env: { EXPO_PUBLIC_ADPICK_AFFILIATE_ID?: string } };
export type AdpickAd = TenpingAd & { imageKind: 'icon' | 'banner' };

function webUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

export function parseAdpickAds(payload: unknown): AdpickAd[] {
  if (!Array.isArray(payload)) throw new Error('애드픽에서 광고 목록을 가져오지 못했습니다.');
  return payload.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.apAppTitle !== 'string' || row.apOffer == null) return [];
    const images = row.apImages && typeof row.apImages === 'object' ? row.apImages as Record<string, unknown> : {};
    const banner = webUrl(images.banner1024x500) ?? webUrl(images.banner960x640) ?? webUrl(images.banner640x640);
    const description = [row.apHeadline, row.apAppPromoText].filter((text): text is string => typeof text === 'string' && text.trim().length > 0).map(text => text.trim());
    return [{ id: String(row.apOffer), title: row.apAppTitle,
      description: [...new Set(description)].join('\n\n'),
      category: typeof row.apOS === 'string' ? (row.apOS === 'Both' ? 'Android · iOS' : row.apOS) : '',
      imageUrl: banner ?? webUrl(images.icon256) ?? webUrl(images.icon), imageKind: banner ? 'banner' as const : 'icon' as const,
      link: webUrl(row.apTrackingLink),
    }];
  });
}

export async function fetchAdpickAds(signal: AbortSignal): Promise<AdpickAd[]> {
  const affiliate = process.env.EXPO_PUBLIC_ADPICK_AFFILIATE_ID?.trim();
  if (!affiliate) throw new Error('애드픽 제휴 ID가 설정되지 않았습니다.');
  const params = new URLSearchParams({ affid: affiliate, os: '', adtype: '', category: '', order: 'rand' });
  const response = await fetch(`https://adpick.co.kr/apis/offers.php?${params}`, { signal });
  if (!response.ok) throw new Error(`광고 서버에 연결하지 못했습니다. (${response.status})`);
  return parseAdpickAds(await response.json());
}
