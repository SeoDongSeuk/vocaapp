import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { version } from '../package.json';

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function StartupFailure({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>앱을 시작하지 못했어요</Text>
    <Text style={styles.message}>아래 오류 내용을 길게 눌러 복사한 뒤 알려주시면 문제를 확인할 수 있어요.</Text>
    <Text style={styles.version}>워드챌린지 {version}</Text>
    <Text selectable style={styles.details}>{error.stack || error.message}</Text>
    <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
      <Text style={styles.buttonText}>다시 시도</Text>
    </Pressable>
  </ScrollView>;
}

export class StartupBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: asError(error) };
  }

  render() {
    return this.state.error
      ? <StartupFailure error={this.state.error} onRetry={this.props.onRetry} />
      : this.props.children;
  }
}

type LoadState = { kind: 'loading' } | { kind: 'ready'; App: ComponentType } | { kind: 'error'; error: Error };

export default function AppBootstrap() {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadState>({ kind: 'loading' });
  const retry = () => { setLoaded({ kind: 'loading' }); setAttempt(value => value + 1); };

  useEffect(() => {
    let active = true;
    // Load inside the mounted root so module-evaluation failures can be shown without USB logs.
    void import('../App').then(module => {
      if (active) setLoaded({ kind: 'ready', App: module.default });
    }).catch(error => {
      if (active) setLoaded({ kind: 'error', error: asError(error) });
    });
    return () => { active = false; };
  }, [attempt]);

  if (loaded.kind === 'error') return <StartupFailure error={loaded.error} onRetry={retry} />;
  if (loaded.kind === 'loading') return <View style={[styles.screen, styles.loading]}><ActivityIndicator color="#6E5AE6" /><Text style={styles.message}>워드챌린지를 시작하고 있어요</Text></View>;
  const App = loaded.App;
  return <StartupBoundary key={attempt} onRetry={retry}><App /></StartupBoundary>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F6FB' },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 72, paddingBottom: 32, gap: 16 },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { color: '#24213A', fontSize: 24, fontWeight: '800' },
  message: { color: '#625D70', fontSize: 15, lineHeight: 23 },
  version: { color: '#89869D', fontSize: 13 },
  details: { color: '#24213A', fontSize: 13, lineHeight: 20, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12 },
  button: { backgroundColor: '#6E5AE6', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
