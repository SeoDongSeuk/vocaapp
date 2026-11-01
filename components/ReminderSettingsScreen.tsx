import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getReminderSettings, saveReminderSettings, scheduleTestReminder, supportsReminders } from '../services/reminders';
import { DEFAULT_REMINDER, ReminderPermissionError, formatReminderTime, parseReminderTime } from '../services/reminderTypes';

export default function ReminderSettingsScreen({ onBack }: { onBack: () => void }) {
  const [saved, setSaved] = useState(DEFAULT_REMINDER);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState('20');
  const [minute, setMinute] = useState('00');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void getReminderSettings().then(settings => {
      if (mounted.current) { setSaved(settings); setEnabled(settings.enabled); setHour(String(settings.hour).padStart(2, '0')); setMinute(String(settings.minute).padStart(2, '0')); }
    }).catch(() => { if (mounted.current) setError('저장된 알림 설정을 읽지 못했습니다.'); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => sub.remove();
  }, [onBack]);
  async function perform(test: boolean) {
    if (lock.current || !supportsReminders || loading) return;
    lock.current = true; setBusy(true); setError(''); setMessage(''); setPermissionDenied(false);
    try {
      if (test) {
        await scheduleTestReminder();
        if (mounted.current) setMessage('5초 후 테스트 알림이 도착하도록 예약했습니다.');
      } else {
        let time = { hour: saved.hour, minute: saved.minute };
        if (enabled) time = parseReminderTime(hour, minute);
        else {
          try { time = parseReminderTime(hour, minute); }
          catch { /* An invalid draft time must never prevent turning reminders off. */ }
        }
        const settings = await saveReminderSettings({ enabled, ...time });
        if (mounted.current) { setSaved(settings); setMessage(settings.enabled ? `매일 ${formatReminderTime(settings)}에 학습 알림을 보냅니다.` : '학습 알림을 껐습니다.'); }
      }
    } catch (cause) {
      if (mounted.current) { setError(cause instanceof Error ? cause.message : '알림을 설정하지 못했습니다.'); setPermissionDenied(cause instanceof ReminderPermissionError); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <SafeAreaView edges={['bottom']} style={styles.screen}>
    <View style={styles.header}><Pressable onPress={onBack} hitSlop={12} accessibilityRole="button"><Text style={styles.back}>‹ 홈으로</Text></Pressable><Text style={styles.heading}>학습 알림</Text></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.row}><View style={styles.copy}><Text style={styles.title}>매일 공부할 시간</Text><Text style={styles.subtitle}>원하는 시간에 영단어 공부를 알려드려요.</Text></View><Switch accessibilityLabel="매일 학습 알림 켜기" value={enabled} onValueChange={setEnabled} disabled={loading || busy || !supportsReminders} trackColor={{ true: '#6E5AE6', false: '#DAD5EB' }} /></View>
        <Text style={styles.label}>알림 시간 · 24시간 기준</Text>
        <View style={styles.timeRow}><TextInput accessibilityLabel="알림 시" keyboardType="number-pad" maxLength={2} value={hour} onChangeText={setHour} editable={!loading && !busy && supportsReminders} style={styles.time} /><Text style={styles.colon}>:</Text><TextInput accessibilityLabel="알림 분" keyboardType="number-pad" maxLength={2} value={minute} onChangeText={setMinute} editable={!loading && !busy && supportsReminders} style={styles.time} /></View>
        {loading ? <ActivityIndicator color="#6E5AE6" /> : <Text style={styles.current}>{saved.enabled ? `현재 설정: 매일 ${formatReminderTime(saved)}` : '현재 설정: 알림 꺼짐'}</Text>}
        <Text style={styles.subtitle}>변경한 설정은 저장을 눌러 적용해 주세요.</Text>
        {!supportsReminders && <Text style={styles.subtitle}>학습 알림은 Expo Go 또는 설치한 휴대폰 앱에서 설정할 수 있어요.</Text>}
        <Pressable accessibilityRole="button" onPress={() => perform(false)} disabled={loading || busy || !supportsReminders} style={[styles.button, (loading || busy || !supportsReminders) && styles.disabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>저장</Text>}</Pressable>
        <Pressable accessibilityRole="button" onPress={() => perform(true)} disabled={loading || busy || !supportsReminders} style={[styles.testButton, (loading || busy || !supportsReminders) && styles.disabled]}><Text style={styles.back}>5초 후 테스트 알림</Text></Pressable>
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {permissionDenied && <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => setError('휴대폰 설정을 열지 못했습니다.')); }}><Text style={styles.back}>휴대폰 알림 설정 열기 ↗</Text></Pressable>}
      </View>
      <Text style={styles.footnote}>휴대폰의 절전·무음·집중 모드 설정에 따라 알림이 늦거나 소리가 나지 않을 수 있어요.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: 54 },
  header: { paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 24, paddingBottom: 20 },
  heading: { color: '#24213A', fontSize: 22, fontWeight: '900' },
  back: { color: '#6E5AE6', fontSize: 14, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  card: { borderRadius: 24, backgroundColor: '#FFFFFF', padding: 22, gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  title: { color: '#24213A', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#777185', fontSize: 12, lineHeight: 19, marginTop: 6 },
  label: { color: '#625D70', fontSize: 13, fontWeight: '700' },
  timeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  time: { width: 88, height: 80, backgroundColor: '#F0EDF9', borderRadius: 18, textAlign: 'center', fontSize: 36, fontWeight: '800', color: '#5745CB' },
  colon: { color: '#5745CB', fontSize: 30, fontWeight: '900' },
  current: { color: '#625D70', fontSize: 13, textAlign: 'center' },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: '#6E5AE6', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  testButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  error: { color: '#AD3E3E', fontSize: 13, lineHeight: 20 },
  success: { color: '#21845A', fontSize: 13, lineHeight: 20 },
  footnote: { color: '#89869D', fontSize: 11, lineHeight: 18, marginTop: 18, textAlign: 'center' },
});
