declare const process: { env: { EXPO_PUBLIC_TENPING_MEMBER_ID?: string } };

export type TenpingAd = {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl: string | null;
  link: string | null;
};

function webUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    // This image host supports HTTPS; avoid Android cleartext and web mixed content.
    if (url.hostname === 'img.tenping.kr') url.protocol = 'https:';
    return url.toString();
  } catch { return null; }
}

export function parseTenpingAds(payload: unknown): TenpingAd[] {
  if (!payload || typeof payload !== 'object') throw new Error('콘텐츠 응답 형식이 올바르지 않습니다.');
  const data = payload as Record<string, unknown>;
  if (data.ResultCode !== 200 || !Array.isArray(data.List)) throw new Error('텐핑에서 콘텐츠 목록을 가져오지 못했습니다.');
  return data.List.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.ContentTitle !== 'string' || row.ContentID == null) return [];
    return [{
      id: String(row.ContentID), title: row.ContentTitle,
      description: typeof row.ContentMemo === 'string' ? row.ContentMemo.trim() : '',
      category: typeof row.CategoryName === 'string' ? row.CategoryName : '',
      imageUrl: webUrl(row.MImage) ?? webUrl(row.SImage), link: webUrl(row.Link),
    }];
  });
}

export async function fetchTenpingAds(signal: AbortSignal): Promise<TenpingAd[]> {
  const memberId = process.env.EXPO_PUBLIC_TENPING_MEMBER_ID?.trim();
  if (!memberId) throw new Error('텐핑 MemberID가 설정되지 않았습니다.');
  const params = new URLSearchParams({ MemberID: memberId, PageSize: '10', CampaignType: '0', MinClickPoint: '0', MinCurrentPoint: '0', ExistMiddleImage: '', ExistRectangleImage: '', IsPartner: '' });
  const response = await fetch(`https://tenping.kr/adbox/list?${params}`, { signal });
  if (!response.ok) throw new Error(`콘텐츠 서버에 연결하지 못했습니다. (${response.status})`);
  return parseTenpingAds(await response.json());
}
