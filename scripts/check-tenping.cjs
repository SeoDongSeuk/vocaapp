const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('services/tenping.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, URL, URLSearchParams, process: { env: { EXPO_PUBLIC_TENPING_MEMBER_ID: 'test-member' } } };
let requestedUrl;
let requestedSignal;
context.fetch = async (url, options) => {
  requestedUrl = new URL(url);
  requestedSignal = options.signal;
  return { ok: true, json: async () => ({ ResultCode: 200, List: [] }) };
};
vm.runInNewContext(source, context);
const { parseTenpingAds, fetchTenpingAds } = context.exports;
const ad = { ContentID: 123, ContentTitle: '광고 제목', ContentMemo: ' 설명 ', CategoryName: '교육', MImage: 'http://img.tenping.kr/a.png?size=360', Link: 'http://yimay.kr/example' };
const [parsed] = parseTenpingAds({ ResultCode: 200, List: [ad] });
assert.equal(parsed.id, '123');
assert.equal(parsed.description, '설명');
assert.equal(parsed.imageUrl, 'https://img.tenping.kr/a.png?size=360');
assert.equal(parsed.link, ad.Link);
assert.equal(parseTenpingAds({ ResultCode: 200, List: [] }).length, 0);
assert.throws(() => parseTenpingAds({ ResultCode: -100, Message: '서버오류' }));
assert.throws(() => parseTenpingAds({ ResultCode: 200, List: {} }));
assert.throws(() => parseTenpingAds(null));
assert.equal(parseTenpingAds({ ResultCode: 200, List: [null, {}, { ContentID: 1 }] }).length, 0);
const [unsafe] = parseTenpingAds({ ResultCode: 200, List: [{ ...ad, MImage: 'data:broken', Link: 'javascript:alert(1)' }] });
assert.equal(unsafe.imageUrl, null);
assert.equal(unsafe.link, null);
const [fallback] = parseTenpingAds({ ResultCode: 200, List: [{ ...ad, MImage: '', SImage: 'https://img.tenping.kr/fallback.png' }] });
assert.equal(fallback.imageUrl, 'https://img.tenping.kr/fallback.png');
(async () => {
  const controller = new AbortController();
  await fetchTenpingAds(controller.signal);
  assert.equal(requestedUrl.protocol, 'https:');
  assert.equal(requestedUrl.searchParams.get('MemberID'), 'test-member');
  assert.equal(requestedUrl.searchParams.get('PageSize'), '10');
  assert.equal(requestedSignal, controller.signal);
  context.process.env.EXPO_PUBLIC_TENPING_MEMBER_ID = '';
  await assert.rejects(() => fetchTenpingAds(controller.signal), /MemberID/);
  console.log('PASS: Tenping parsing, empty/error/malformed responses, URL validation, image fallback, and request configuration.');
})().catch(error => { console.error(error); process.exitCode = 1; });
