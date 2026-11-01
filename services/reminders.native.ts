import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { DAILY_REMINDER_ID, TEST_REMINDER_ID, REMINDER_STORAGE_KEY, ReminderPermissionError, parseReminderTime, readReminderSettings, type ReminderSettings } from './reminderTypes';

export const supportsReminders = true;
const CHANNEL_ID = 'study-reminders';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

function allowed(permission: Notifications.NotificationPermissionsStatus): boolean {
  return permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL || permission.ios?.status === IosAuthorizationStatus.EPHEMERAL;
}

async function ensurePermission(): Promise<void> {
  if (Platform.OS === 'android') {
    // Omit sound to keep Android's default. Some native versions dereference the
    // absent audioAttributes map when a sound option is explicitly supplied.
    const channel = await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: '매일 학습 알림', importance: AndroidImportance.DEFAULT });
    if (channel?.importance === AndroidImportance.NONE) throw new ReminderPermissionError();
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!allowed(permission) && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  if (!allowed(permission)) throw new ReminderPermissionError();
}

async function storedSettings(): Promise<ReminderSettings> {
  return readReminderSettings(await AsyncStorage.getItem(REMINDER_STORAGE_KEY));
}

async function scheduleDaily(settings: ReminderSettings): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: { title: '워드챌린지', body: '오늘도 영단어 10개, 함께 익혀 볼까요?', sound: 'default', data: { kind: 'study-reminder' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: settings.hour, minute: settings.minute, channelId: CHANNEL_ID, delivery: 'bestEffort' },
  });
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  const settings = await storedSettings();
  if (!settings.enabled) return settings;
  const [pending, permission] = await Promise.all([Notifications.getAllScheduledNotificationsAsync(), Notifications.getPermissionsAsync()]);
  return { ...settings, enabled: pending.some(item => item.identifier === DAILY_REMINDER_ID) && allowed(permission) };
}

let mutations: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = mutations.then(task, task);
  mutations = next.catch(() => undefined);
  return next;
}

export function saveReminderSettings(settings: ReminderSettings): Promise<ReminderSettings> {
  return serialize(async () => {
    parseReminderTime(String(settings.hour), String(settings.minute));
    const previous = await getReminderSettings();
    if (settings.enabled) await ensurePermission();
    try {
      // A fixed identifier updates the same OS request, rather than adding duplicates.
      if (settings.enabled) await scheduleDaily(settings);
      else {
        await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
        await Notifications.cancelScheduledNotificationAsync(TEST_REMINDER_ID);
      }
      await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(settings));
      return { ...settings };
    } catch (cause) {
      try {
        if (previous.enabled) await scheduleDaily(previous);
        else await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
        await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(previous));
      } catch {
        await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => undefined);
        await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify({ ...previous, enabled: false })).catch(() => undefined);
        throw new Error('알림 상태를 복구하지 못했습니다. 휴대폰 알림 설정을 확인한 뒤 다시 설정해 주세요.');
      }
      throw cause;
    }
  });
}

export function scheduleTestReminder(): Promise<void> {
  return serialize(async () => {
    await ensurePermission();
    await Notifications.scheduleNotificationAsync({ identifier: TEST_REMINDER_ID,
      content: { title: '워드챌린지 테스트 알림', body: '학습 알림이 이렇게 도착해요.', sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false, channelId: CHANNEL_ID },
    });
  });
}
