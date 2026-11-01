# 워드챌린지 (Word Challenge)

An English vocabulary study app built with Expo and React Native. Each of six levels contains 1,000 words with Korean meanings, from beginner vocabulary through advanced adult and native-speaker vocabulary. Learn 10 words with flashcards, review words you miss, or take a timed quiz at the selected level.

## Play

The home screen contains three horizontally paged cards: **나의 학습 단계 → 텐핑 광고 → 애드픽 광고**. Swipe left to advance or right to return. The brand header remains visible, with a page indicator and swipe hint below it. Each page scrolls vertically independently. Each provider loads only when its card is first opened and retains its own list and reload state; Android Back returns to the previous card. The ad lists show images, titles, categories or supported OS, descriptions, reload, and explicit external-link buttons. Publisher payout fields are not presented as user rewards. Requests use HTTPS and abort after 15 seconds. Empty lists, connection errors, and image failures have fallback UI. Adpick uses a banner when available, otherwise an uncropped app icon.

Copy `.env.example` to `.env.local`, set `EXPO_PUBLIC_TENPING_MEMBER_ID` to your Tenping publisher MemberID, and restart Expo after changing the value. `.env.local` is ignored by Git. This EXPO_PUBLIC value is embedded in the mobile bundle and must not contain a secret API key. The supplied publisher ID is configured locally, not committed. Native Expo Go can call the API directly; browser use also requires the provider to permit your web origin via CORS.

Set `EXPO_PUBLIC_ADPICK_AFFILIATE_ID` to your Adpick `affid` in the same local file. The offers API uses the supplied empty OS/type/category filters and `order=rand`. `node scripts/check-adpick.cjs` checks parsing and request configuration without opening tracking links.

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
