import { DEFAULT_REMINDER, type ReminderSettings } from './reminderTypes';

export const supportsReminders = false;
export async function getReminderSettings(): Promise<ReminderSettings> { return { ...DEFAULT_REMINDER }; }
export async function saveReminderSettings(_settings: ReminderSettings): Promise<ReminderSettings> {
  throw new Error('학습 알림은 휴대폰 앱에서 설정해 주세요.');
}
export async function scheduleTestReminder(): Promise<void> { throw new Error('테스트 알림은 휴대폰 앱에서 사용할 수 있습니다.'); }
