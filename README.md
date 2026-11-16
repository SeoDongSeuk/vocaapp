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

EAS Build uploads the project source to Expo's cloud build service and uses the existing signing credentials. Android SDK and Java are also installed locally; emulator testing currently cannot proceed past ADB authentication.

Version 1.0.2 preserves Room database and WorkManager input-merger constructors in Android release builds through `expo-build-properties`. WorkManager is initialized before JavaScript, and SDK 58's R8 full mode can otherwise strip the constructors it loads reflectively, causing the app to close immediately. This workaround follows [Expo issue #52173](https://github.com/expo/expo/issues/52173) and [the upstream fix](https://github.com/expo/expo/pull/51349). Confirm the constructors in the built APK as well as cold launch on the target device; a successful build alone does not verify startup.

Run `node scripts/check-apk-constructors.cjs --apk /path/to/app.apk` against the release APK. It reads the actual DEX constructor definitions and fails if WorkDatabase_Impl or either WorkManager input merger lacks its no-argument constructor. The reported 1.0.1 APK fails this check. Without a device crash log the specific user's crash is not confirmed; verify the rebuilt APK and a cold launch before reporting that the device issue is resolved.

The 1.0.2 APK passes constructor and arm64 16 KB ELF/ZIP alignment checks, but the user still reported an immediate exit on a Galaxy S25 Ultra. Version 1.0.3 disables Android release minification and resource shrinking to investigate other optimization-related startup failures. `AppBootstrap` loads the app module after registering the root and displays selectable error details for module-loading/render failures, allowing diagnosis without USB. This does not catch native crashes or prove the remaining device failure is fixed. Confirm launch on the target phone.

The user confirmed that 1.0.3 runs correctly on the Galaxy S25 Ultra. Version 1.0.4 (Android version code 5) retains the Android startup configuration, fits the home level list more compactly, improves right-swipe recognition in study cards, and adds a `production` profile for a signed Google Play Android App Bundle:

```bash
npx eas-cli@latest build --platform android --profile production
```

The profile inherits the same toolchain from `preview`, overrides distribution to `store`, and uses `android.buildType: app-bundle`. The resulting `.aab` is for upload to Google Play Console, rather than direct phone installation. See the [Expo AAB documentation](https://docs.expo.dev/build-reference/apk/) and [build configuration reference](https://docs.expo.dev/eas/json/). Build creation does not upload or publish a Google Play release.

The home level rows now include their own quiz record, keeping all five levels visible at ordinary phone sizes without reducing the existing label or button text sizes. The home page measures its viewport and content, enabling vertical scrolling only when needed for smaller screens or larger text. Overscroll/bounce is disabled on this page. The shopping and advertising pages retain their independent scrolling.

In study cards, a right drag or short right fling shows `✓ 외웠어요`, then advances once and records the word as known. This works before and after revealing the meaning. Left/vertical drags, taps, and canceled gestures do not mark the word. `node scripts/check-study-swipe.cjs` checks direction/velocity thresholds, confirmation, one-time completion, cancellation, current callbacks after rerenders, and cleanup after unmount. Native Android touch interaction still needs a device test for this release.

## AdMob (1.0.5 / Android version code 6)

The Android app now uses its registered AdMob application ID in `app.json`. Configure the public ad unit IDs in `.env.local` using the Android banner/interstitial variables in `.env.example`; the existing local publisher IDs are included in EAS builds through `.easignore`. The `/` ad unit IDs are different from the `~` application ID. These identifiers are embedded in the client and are not secret credentials. Production never substitutes Google's sample ad units for missing configuration.

A 320×50 banner appears below the home, study, quiz and result screens when online and ready. The root owns the bottom safe-area inset once, so the banner does not cover controls. Offline, unavailable SDK, missing IDs or load failure removes the banner. The native AdMob package is not imported by the web fallback or Expo Go.

The SDK gathers UMP consent before initialization. When UMP requires privacy options, a home-screen button opens them. Held ads are retired when privacy choices change. Learning results do not wait for consent, initialization or an ad request.

The last card of a study session and the end of the 60-second quiz each attempt one preloaded interstitial. Leaving early does not trigger one. An unavailable, expired or failed ad is skipped for that completed session; it will not pop up later on the results screen or after returning online. SDK errors are contained and the app keeps working.

Use `npx eas-cli@latest build --platform android --profile production` for the Play AAB with real ad unit IDs. The separate `adtest` profile builds a release APK with Google's test ad units (`EXPO_PUBLIC_ADMOB_TEST_ADS=1`); production explicitly sets this flag to `0`. Use the test build to check rendering without generating live traffic on your own units. Expo Go cannot display the native ads.

`node scripts/check-admob.cjs` exercises consent/initialization sharing, completion triggers, duplicates, late callbacks, offline/background transitions, expiry, show/load failures, privacy changes and banner collapse with mocked hooks/SDK. It does not request real ads. Native SDK rendering needs a physical-device test. Newly created units and apps are also subject to AdMob's propagation, app-store linkage and app-readiness review; building an AAB does not approve live serving.

The Play listing icon is `store-assets/google-play-icon.png`, a 512×512 32-bit sRGB PNG exported from the existing app icon. Regenerate it with `node scripts/export-play-icon.cjs` when the app icon changes.
