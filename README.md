# 워드챌린지 (Word Challenge)

An English vocabulary study app built with Expo and React Native. Five selectable levels—초급, 중급, 고급, 최상급, 마스터—contain 4,911 individually reviewed general-vocabulary entries with Korean meanings (1,000 per level except 911 in 마스터). The default level is 초급. Learn 30 words with flashcards (swipe right to mark a word as known), review words you miss, or take a timed quiz at the selected level. Phonetic transcriptions are not displayed in study cards or quizzes.

## Play

Daily study reminders have been removed. A standalone Android test APK can be built with `npx eas-cli@latest build --platform android --profile preview`. Sign in with `npx eas-cli@latest login` first. The preview profile builds an installable APK with the JavaScript and assets bundled, so Expo Go and a development server are not required. Network access is still needed for shopping/partner lists. `.easignore` includes the existing `.env.local` containing only the two public publisher identifiers; never put private credentials in that file. After a successful build, use the EAS artifact URL to download/install the APK.

Study and quiz words have a **발음 듣기** button powered by expo-speech. It prefers an available US English voice, otherwise another English voice, and reads at a slightly slower rate. Tap again to stop. Changing the word, leaving the screen, or backgrounding the app cancels speech, including pending voice lookups. No microphone permission is needed. Voice quality/availability depend on the device's speech engine; iOS physical devices must have silent mode turned off. `node scripts/check-word-speech.cjs` validates the voice selection and cancellation logic with a mocked speech engine. Actual audio must also be checked on the target phone.

The home screen contains five horizontally paged cards: **나의 학습 단계 → 쇼핑 핫딜 → 쇼핑 추천상품 → 애드픽 → 텐핑**. Swipe left to advance or right to return. The brand header remains visible, with a page indicator and swipe hint below it. Each page scrolls vertically independently; Android Back returns to the previous card. Each provider first loads on entry. Subsequent requests happen only on re-entry after at least three minutes since its last request attempt. There is no periodic refresh timer, refresh button, or pull-to-refresh. Successful data, failures and in-flight requests are cached separately for each provider for the app session, including while a study screen is open. Failed attempts are also throttled, and previous successful data is kept on failure. Requests time out after 15 seconds. `node scripts/check-campaign-cache.cjs` checks the three-minute boundary and request deduplication.

The ad lists show images, titles, categories or supported OS, descriptions, and explicit external-link buttons. Introductory provider-description paragraphs have been removed; individual cards use a 제휴 label and provider attribution. Publisher payout fields are not presented as user rewards. Empty lists, connection errors, and image failures have fallback UI. Adpick uses a banner when available, otherwise an uncropped app icon.

Copy `.env.example` to `.env.local`, set `EXPO_PUBLIC_TENPING_MEMBER_ID` to your Tenping publisher MemberID, and restart Expo after changing the value. `.env.local` is ignored by Git. This EXPO_PUBLIC value is embedded in the mobile bundle and must not contain a secret API key. The supplied publisher ID is configured locally, not committed. Native Expo Go can call the API directly; browser use also requires the provider to permit your web origin via CORS.

Set `EXPO_PUBLIC_ADPICK_AFFILIATE_ID` to your Adpick `affid` in the same local file. The offers API uses the supplied empty OS/type/category filters and `order=rand`. `node scripts/check-adpick.cjs` checks parsing and request configuration without opening tracking links.

Shopping hotdeals use the same affiliate ID and `/apis/sdk_shopping_hotdeal.php`. Nested group lists are flattened, duplicate purchase links are removed, and product images are shown without cropping. Sale prices are shown when valid; original prices are struck through only when higher than the sale price. Missing prices are not converted to zero. Final availability and prices are confirmed at the external merchant. The API's `commission` field is publisher commission, not customer cashback, and is not displayed. `node scripts/check-shopping.cjs` validates this response format; it does not open purchase or tracking links.

Shopping recommendations use `/apis/sdk_shopping.php` with the same parser and affiliate ID, but a separate cache and card. The feed includes travel products with placeholder zero prices; nonpositive or missing prices are shown as ‘가격은 판매처에서 확인해 주세요’, not free products.

The former 입문 bank has been removed from the runtime vocabulary; core A1 words are now included in 초급. Historical illustration sources remain archived. The historical replacement list is in `data/starter-word-replacements.json`.

Archived picture plans are in `data/starter-picture-plan.txt`. `node scripts/build-starter-art.cjs` validates their coverage and regenerates the artwork data. `--download` retrieves missing source SVGs during development only. Artwork attribution and license details are in `assets/word-art/ATTRIBUTION.md`.

On the home screen, each level has **학습하기** and **1분 퀴즈** buttons. Choose **학습하기** to study 30 flashcards: reveal each Korean meaning, then mark the word as known or add it to the review list. Review words again from the home screen.

Choose a level's **1분 퀴즈** button to answer English-to-Korean questions from that level for 60 seconds. Study cards and quiz questions share a shuffled full-bank cycle for each level, so a target word appears once per cycle before the next cycle can repeat it. This cycle lasts while the app stays open; review mode intentionally repeats words you've marked for review. The home screen and result screen show the highest score separately for each level during the current app session.

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

Version 1.0.2 preserves Room database and WorkManager input-merger constructors in Android release builds through `expo-build-properties`. WorkManager is initialized before JavaScript, and SDK 58's R8 full mode can otherwise strip the constructors it loads reflectively, causing the app to close immediately. This workaround follows [Expo issue #52173](https://github.com/expo/expo/issues/52173) and [the upstream fix](https://github.com/expo/expo/pull/51349). Confirm the constructors in the built APK as well as cold launch on the target device; a successful build alone does not verify startup.

Run `node scripts/check-apk-constructors.cjs --apk /path/to/app.apk` against the release APK. It reads the actual DEX constructor definitions and fails if WorkDatabase_Impl or either WorkManager input merger lacks its no-argument constructor. The reported 1.0.1 APK fails this check. Without a device crash log the specific user's crash is not confirmed; verify the rebuilt APK and a cold launch before reporting that the device issue is resolved.
