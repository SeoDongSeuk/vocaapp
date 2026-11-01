const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, modules = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const context = { exports: {}, require: name => { if (!(name in modules)) throw new Error(`Unexpected module: ${name}`); return modules[name]; } };
  vm.runInNewContext(js, context);
  return context.exports;
}
const types = load('services/reminderTypes.ts');
assert.equal(types.formatReminderTime(types.parseReminderTime('00', '05')), '00:05');
for (const [h, m] of [['24', '00'], ['12', '60'], ['-1', '20'], ['2.5', '00'], ['', '00']]) assert.throws(() => types.parseReminderTime(h, m));
assert.equal(types.readReminderSettings('broken').enabled, false);
assert.equal(types.readReminderSettings('{"enabled":true,"hour":99,"minute":0}').enabled, false);
let permission = { granted: true, canAskAgain: true };
let failWrite = false;
let blockedChannel = false;
let handler;
let requests = 0;
const storage = new Map();
const pending = new Map([['unrelated', { identifier: 'unrelated' }]]);
const notifications = {
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 }, AndroidImportance: { DEFAULT: 5, NONE: 2 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: value => { handler = value; },
  setNotificationChannelAsync: async (_, options) => {
    // Reproduce affected Android bridges: supplying sound without audioAttributes
    // enters a native path that dereferences the missing argument map.
    if ('sound' in options && !options.audioAttributes) throw new Error('NullPointerException: missing audioAttributes');
    assert.equal('sound' in options, false, 'Use Android default channel sound');
    return { importance: blockedChannel ? 2 : 5 };
  },
  getPermissionsAsync: async () => permission,
  requestPermissionsAsync: async () => { requests++; return permission; },
  getAllScheduledNotificationsAsync: async () => [...pending.values()],
  scheduleNotificationAsync: async request => { pending.set(request.identifier, request); return request.identifier; },
  cancelScheduledNotificationAsync: async id => { pending.delete(id); },
};
const service = load('services/reminders.native.ts', {
  './reminderTypes': types, 'react-native': { Platform: { OS: 'android' } }, 'expo-notifications': notifications,
  '@react-native-async-storage/async-storage': {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { if (failWrite) { failWrite = false; throw new Error('storage failure'); } storage.set(key, value); },
  },
});
(async () => {
  assert.equal((await service.getReminderSettings()).enabled, false);
  assert.equal(requests, 0, 'Reading preferences never prompts');
  assert.equal((await handler.handleNotification()).shouldShowBanner, true);
  await service.saveReminderSettings({ enabled: true, hour: 20, minute: 5 });
  assert.equal(pending.get(types.DAILY_REMINDER_ID).trigger.minute, 5);
  assert.equal(pending.get(types.DAILY_REMINDER_ID).trigger.delivery, 'bestEffort');
  await service.saveReminderSettings({ enabled: true, hour: 6, minute: 30 });
  assert.equal(pending.size, 2, 'One daily reminder plus unrelated notification');
  permission = { granted: false, canAskAgain: false };
  await assert.rejects(() => service.saveReminderSettings({ enabled: true, hour: 7, minute: 0 }), types.ReminderPermissionError);
  assert.equal(pending.get(types.DAILY_REMINDER_ID).trigger.hour, 6);
  permission = { granted: true, canAskAgain: true };
  await service.scheduleTestReminder();
  assert.equal(pending.get(types.TEST_REMINDER_ID).trigger.seconds, 5);
  assert.equal(pending.get(types.DAILY_REMINDER_ID).trigger.hour, 6);
  failWrite = true;
  await assert.rejects(() => service.saveReminderSettings({ enabled: true, hour: 22, minute: 0 }));
  assert.equal(pending.get(types.DAILY_REMINDER_ID).trigger.hour, 6, 'Storage failure restores original schedule');
  assert.equal((await service.getReminderSettings()).hour, 6);
  blockedChannel = true;
  await assert.rejects(() => service.scheduleTestReminder(), types.ReminderPermissionError);
  blockedChannel = false;
  permission = { granted: false, canAskAgain: false };
  await service.saveReminderSettings({ enabled: false, hour: 6, minute: 30 });
  assert.equal(pending.size, 1, 'Turning off cancels only our daily and test reminders');
  assert.equal(pending.has('unrelated'), true);
  assert.equal((await service.getReminderSettings()).enabled, false);
  console.log('PASS: time validation, permission refusal, channel refusal, single daily reservation, time changes, five-second test, storage rollback and scoped cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
