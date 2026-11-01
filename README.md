# 워드챌린지 (Word Challenge)

An English vocabulary study app built with Expo and React Native. Each of six levels contains 1,000 words with Korean meanings, from beginner vocabulary through advanced adult and native-speaker vocabulary. Learn 10 words with flashcards, review words you miss, or take a timed quiz at the selected level.

## Play

The home screen contains five horizontally paged cards: **나의 학습 단계 → 쇼핑 핫딜 → 쇼핑 추천상품 → 애드픽 광고 → 텐핑 광고**. Swipe left to advance or right to return. The brand header remains visible, with a page indicator and swipe hint below it. Each page scrolls vertically independently; Android Back returns to the previous card. Each provider first loads on entry. Subsequent requests happen only on re-entry after at least three minutes since its last request attempt. There is no periodic refresh timer, refresh button, or pull-to-refresh. Successful data, failures and in-flight requests are cached separately for each provider for the app session, including while a study screen is open. Failed attempts are also throttled, and previous successful data is kept on failure. Requests time out after 15 seconds. `node scripts/check-campaign-cache.cjs` checks the three-minute boundary and request deduplication.

The ad lists show images, titles, categories or supported OS, descriptions, and explicit external-link buttons. Introductory provider-description paragraphs have been removed; individual cards retain their ad attribution. Publisher payout fields are not presented as user rewards. Empty lists, connection errors, and image failures have fallback UI. Adpick uses a banner when available, otherwise an uncropped app icon.

Copy `.env.example` to `.env.local`, set `EXPO_PUBLIC_TENPING_MEMBER_ID` to your Tenping publisher MemberID, and restart Expo after changing the value. `.env.local` is ignored by Git. This EXPO_PUBLIC value is embedded in the mobile bundle and must not contain a secret API key. The supplied publisher ID is configured locally, not committed. Native Expo Go can call the API directly; browser use also requires the provider to permit your web origin via CORS.

Set `EXPO_PUBLIC_ADPICK_AFFILIATE_ID` to your Adpick `affid` in the same local file. The offers API uses the supplied empty OS/type/category filters and `order=rand`. `node scripts/check-adpick.cjs` checks parsing and request configuration without opening tracking links.

Shopping hotdeals use the same affiliate ID and `/apis/sdk_shopping_hotdeal.php`. Nested group lists are flattened, duplicate purchase links are removed, and product images are shown without cropping. Sale prices are shown when valid; original prices are struck through only when higher than the sale price. Missing prices are not converted to zero. Final availability and prices are confirmed at the external merchant. The API's `commission` field is publisher commission, not customer cashback, and is not displayed. `node scripts/check-shopping.cjs` validates this response format; it does not open purchase or tracking links.

Shopping recommendations use `/apis/sdk_shopping.php` with the same parser and affiliate ID, but a separate cache and card. The feed includes travel products with placeholder zero prices; nonpositive or missing prices are shown as ‘가격은 판매처에서 확인해 주세요’, not free products.

The 입문 study cards show locally bundled Twemoji vector picture clues. Concrete nouns use object pictures; actions and concepts can use symbolic multi-icon scenes. All 1,000 entry words have an explicit image mapping. Grammar words such as `and`, `between`, and `beside` were exchanged for familiar concrete vocabulary while keeping 1,000 unique entries per level. The replacement list is in `data/starter-word-replacements.json`.

Picture plans are maintained in `data/starter-picture-plan.txt`. Run `node scripts/build-starter-art.cjs` to validate coverage and regenerate the offline artwork data. `--download` retrieves missing source SVGs during development only. Artwork attribution and license details are in `assets/word-art/ATTRIBUTION.md`.

On the home screen, each level has **학습하기** and **1분 퀴즈** buttons. Choose **학습하기** to study 10 flashcards: reveal each Korean meaning, then mark the word as known or add it to the review list. Review words again from the home screen.

Choose a level's **1분 퀴즈** button to answer English-to-Korean questions from that level for 60 seconds. Study cards and quiz questions share a shuffled 1,000-word cycle for each level, so a target word appears once per cycle before the next cycle can repeat it. This cycle lasts while the app stays open; review mode intentionally repeats words you've marked for review. The home screen and result screen show the highest score separately for each level during the current app session.

Vocabulary data attributions and license terms are in [VOCABULARY-LICENSE.md](VOCABULARY-LICENSE.md).

```bash
pnpm install
pnpm run web
```

To launch the Expo development server for a phone, run `pnpm start` and scan the QR code with Expo Go.

The native launch splash is configured through `expo-splash-screen`. Expo Go shows its own app icon during native startup; the matching branded splash appears in the app before the welcome screen.

## Android installable build

The `preview` EAS profile is configured to produce an installable APK:

```bash
eas build --platform android --profile preview
```

EAS Build uploads the project source to Expo's cloud build service. This computer does not have the Android SDK or Java toolchain for a local APK build.
