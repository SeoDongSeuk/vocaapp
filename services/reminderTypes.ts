export type ReminderSettings = { enabled: boolean; hour: number; minute: number };
export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 20, minute: 0 };
export const REMINDER_STORAGE_KEY = 'wordchallenge.daily-reminder.v1';
export const DAILY_REMINDER_ID = 'wordchallenge.daily-reminder';
export const TEST_REMINDER_ID = 'wordchallenge.test-reminder';

export class ReminderPermissionError extends Error {
  constructor() { super('알림 권한이 꺼져 있습니다. 휴대폰 설정에서 알림을 허용해 주세요.'); }
}

export function parseReminderTime(hour: string, minute: string): { hour: number; minute: number } {
  if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute) || Number(hour) > 23 || Number(minute) > 59) {
    throw new Error('시간은 0~23시, 분은 0~59분으로 입력해 주세요.');
  }
  return { hour: Number(hour), minute: Number(minute) };
}

export function readReminderSettings(raw: string | null): ReminderSettings {
  if (raw) {
    try {
      const value = JSON.parse(raw);
      if (typeof value.enabled === 'boolean' && Number.isInteger(value.hour) && value.hour >= 0 && value.hour <= 23 && Number.isInteger(value.minute) && value.minute >= 0 && value.minute <= 59) return { enabled: value.enabled, hour: value.hour, minute: value.minute };
    } catch { /* Recover from a missing or invalid preference without enabling an alarm. */ }
  }
  return { ...DEFAULT_REMINDER };
}

export function formatReminderTime(settings: Pick<ReminderSettings, 'hour' | 'minute'>): string {
  return `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`;
}
