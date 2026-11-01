import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { speakWord, stopWordSpeech } from '../services/wordSpeech';

export default function WordSpeaker({ word }: { word: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'speaking' | 'error'>('idle');
  const [error, setError] = useState('');
  const live = useRef(false);
  const request = useRef(0);
  useEffect(() => {
    live.current = true;
    const stop = () => { request.current++; void stopWordSpeech().catch(() => undefined); };
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        stop();
        if (live.current) setStatus('idle');
      }
    });
    return () => { live.current = false; stop(); subscription.remove(); };
  }, [word]);
  async function toggleSpeech() {
    const ticket = ++request.current;
    setError('');
    if (status === 'loading' || status === 'speaking') {
      setStatus('idle');
      await stopWordSpeech().catch(() => undefined);
      return;
    }
    setStatus('loading');
    const current = (callback: () => void) => () => { if (live.current && ticket === request.current) callback(); };
    try {
      await speakWord(word, {
        onStart: current(() => setStatus('speaking')),
        onDone: current(() => setStatus('idle')),
        onError: current(() => { setStatus('error'); setError('소리를 재생하지 못했습니다. 영어 음성과 미디어 볼륨을 확인해 주세요.'); }),
      });
    } catch (cause) {
      current(() => { setStatus('error'); setError(cause instanceof Error ? cause.message : '발음을 재생하지 못했습니다.'); })();
    }
  }
  const playing = status === 'loading' || status === 'speaking';
  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${word} 발음 ${playing ? '중지' : '듣기'}`} accessibilityState={{ busy: status === 'loading' }} onPress={toggleSpeech} style={({ pressed }) => [styles.button, playing && styles.playing, pressed && styles.pressed]}>
      <Text style={styles.label}>{status === 'loading' ? '■ 준비 중 · 중지' : status === 'speaking' ? '■ 발음 중지' : '🔊 발음 듣기'}</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginTop: 10, maxWidth: '100%' },
  button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F0EDF9', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#5745CB', fontSize: 13, fontWeight: '700' },
  playing: { backgroundColor: '#E2DDF7' },
  pressed: { opacity: 0.7 },
  error: { color: '#AD3E3E', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8 },
});
