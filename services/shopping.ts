import type { TenpingAd } from './tenping';

declare const process: { env: { EXPO_PUBLIC_ADPICK_AFFILIATE_ID?: string } };
export type ShoppingDeal = TenpingAd & { imageKind: 'product'; salePrice: number | null; originalPrice: number | null };

function webUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
}

function price(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(value.trim())) return null;
  const amount = Number(value.replaceAll(',', '').trim());
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function parseShoppingDeals(payload: unknown): ShoppingDeal[] {
  if (!Array.isArray(payload)) throw new Error('쇼핑 상품 목록을 가져오지 못했습니다.');
  const deals: ShoppingDeal[] = [];
  const seen = new Set<string>();
  let validGroups = 0;
  for (const group of payload) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.list)) continue;
    validGroups++;
    for (const item of group.list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (typeof row.product_name !== 'string' || !row.product_name.trim()) continue;
      const link = webUrl(row.buyurl);
      const mall = typeof row.mall_name === 'string' ? row.mall_name : typeof row.mall === 'string' ? row.mall : '';
      const id = link ?? `${mall}:${row.product_name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      deals.push({ id, title: row.product_name, description: '', category: mall,
        imageUrl: webUrl(row.photo), imageKind: 'product', link,
        salePrice: price(row.price_sale), originalPrice: price(row.price_org),
      });
    }
  }
  if (payload.length > 0 && validGroups === 0) throw new Error('쇼핑 상품 응답 형식이 올바르지 않습니다.');
  return deals;
}

export async function fetchShoppingDeals(signal: AbortSignal): Promise<ShoppingDeal[]> {
  return fetchShoppingEndpoint('sdk_shopping_hotdeal.php', signal);
}

export async function fetchShoppingRecommendations(signal: AbortSignal): Promise<ShoppingDeal[]> {
  return fetchShoppingEndpoint('sdk_shopping.php', signal);
}

async function fetchShoppingEndpoint(endpoint: string, signal: AbortSignal): Promise<ShoppingDeal[]> {
  const affiliate = process.env.EXPO_PUBLIC_ADPICK_AFFILIATE_ID?.trim();
  if (!affiliate) throw new Error('애드픽 제휴 ID가 설정되지 않았습니다.');
  const params = new URLSearchParams({ affid: affiliate });
  const response = await fetch(`https://adpick.co.kr/apis/${endpoint}?${params}`, { signal });
  if (!response.ok) throw new Error(`쇼핑 서버에 연결하지 못했습니다. (${response.status})`);
  // The provider labels this endpoint text/html even though its body is JSON.
  return parseShoppingDeals(await response.json());
}
