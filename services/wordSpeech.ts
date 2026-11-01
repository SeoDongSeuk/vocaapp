import * as Speech from 'expo-speech';

type SpeechCallbacks = { onStart: () => void; onDone: () => void; onError: () => void };
let generation = 0;

export async function stopWordSpeech(): Promise<void> {
  generation++;
  await Speech.stop();
}

/** Replace speech instead of building an utterance queue. Invalidate pending voice lookups too. */
export async function speakWord(word: string, callbacks: SpeechCallbacks): Promise<void> {
  const text = word.trim();
  if (!text) return;
  const ticket = ++generation;
  await Speech.stop();
  if (ticket !== generation) return;
  let voices: Speech.Voice[] = [];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { voices = await Promise.race([Speech.getAvailableVoicesAsync(), new Promise<Speech.Voice[]>(resolve => { timeout = setTimeout(() => resolve([]), 2500); })]); }
  catch { /* The engine can still select a default English voice by language. */ }
  finally { if (timeout !== undefined) clearTimeout(timeout); }
  if (ticket !== generation) return;
  const english = voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.language));
  const voice = english.find(item => /^en[-_]us$/i.test(item.language)) ?? english[0];
  if (voices.length > 0 && !voice) throw new Error('휴대폰의 음성 설정에서 영어 음성을 설치해 주세요.');
  const current = (callback: () => void) => () => { if (ticket === generation) callback(); };
  Speech.speak(text, {
    language: voice?.language.replaceAll('_', '-') ?? 'en-US',
    voice: voice?.identifier,
    rate: 0.85, pitch: 1,
    onStart: current(callbacks.onStart), onDone: current(callbacks.onDone),
    onStopped: current(callbacks.onDone), onError: current(callbacks.onError),
  });
}
