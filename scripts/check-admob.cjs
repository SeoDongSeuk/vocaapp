// Deterministic SDK/lifecycle mocks: never sends ad requests or imports a real native SDK.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(path.dirname(module.filename), '..');
const jsx = (type, props, key) => ({ type, props: props || {}, key });
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clock() {
  let now = 1_800_000_000_000, sequence = 0;
  const timers = new Map();
  const add = (fn, delay, repeat) => {
    const id = ++sequence;
    timers.set(id, { fn, delay, repeat, at: now + delay });
    return id;
  };
  return {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, delay = 0) => add(fn, delay, false),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => add(fn, delay, true),
    clearInterval: id => timers.delete(id),
    advance(duration) {
      now += duration;
      // One tick per timer is sufficient for elapsed-time-based app countdowns.
      for (const [id, timer] of [...timers]) {
        if (timer.at > now || !timers.has(id)) continue;
        if (timer.repeat) timer.at = now + timer.delay;
        else timers.delete(id);
        timer.fn();
      }
    },
  };
}
function load(relative, mocks, globals = {}) {
  const filename = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exported = {};
  const context = {
    exports: exported, module: { exports: exported }, __DEV__: false, Promise, Error,
    console: { warn() {}, log() {}, error() {} },
    process: { env: {} },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (!(name in mocks)) throw new Error(`Unexpected import in ${relative}: ${name}`);
      const value = mocks[name];
      if (value instanceof Error) throw value;
      return value;
    },
    ...globals,
  };
  vm.runInNewContext(code, context, { filename });
  return context.module.exports;
}
function hooks() {
  const values = [];
  let cursor = 0, effects = [];
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [values[index].value, next => { values[index].value = typeof next === 'function' ? next(values[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!values[index] || !depsEqual(values[index].dependencies, dependencies)) values[index] = { dependencies, value: factory() };
      return values[index].value;
    },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = values[index];
      if (!previous || !depsEqual(previous.dependencies, dependencies)) {
        effects.push(() => {
          previous?.cleanup?.();
          values[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  react.useSyncExternalStore = (subscribe, getSnapshot) => {
    react.useEffect(() => subscribe(() => {}), [subscribe]);
    return getSnapshot();
  };
  return {
    react,
    render(component) {
      cursor = 0; effects = [];
      const result = component();
      for (const effect of effects) effect();
      return result;
    },
    unmount() { for (const value of values) value?.cleanup?.(); },
    reset() { for (const value of values) value?.cleanup?.(); values.length = 0; },
  };
}
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return text(tree.props?.children);
}

function nativeMocks(options = {}) {
  const time = clock();
  const calls = { imports: 0, consent: 0, info: 0, initialize: 0, privacy: 0, create: 0, load: 0, show: 0, destroy: 0 };
  const ads = [], listeners = new Set();
  const network = { isConnected: true, isInternetReachable: true };
  const AppState = {
    currentState: 'active',
    addEventListener(_event, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
  };
  const sdk = {
    __esModule: true,
    default: () => ({ initialize() {
      calls.initialize++;
      if (options.initializeError) return Promise.reject(options.initializeError);
      return options.initialization?.promise ?? Promise.resolve([]);
    } }),
    AdsConsent: {
      gatherConsent() {
        calls.consent++;
        if (options.consentError) return Promise.reject(options.consentError);
        return options.consent?.promise ?? Promise.resolve({ canRequestAds: options.canRequestAds !== false });
      },
      getConsentInfo() { calls.info++; return Promise.resolve({ canRequestAds: options.canRequestAds !== false, privacyOptionsRequirementStatus: options.privacyRequired ? 'REQUIRED' : 'NOT_REQUIRED' }); },
      showPrivacyOptionsForm() { calls.privacy++; return options.privacy?.promise ?? Promise.resolve({ canRequestAds: true }); },
    },
    AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', UNKNOWN: 'UNKNOWN' },
    AdEventType: { LOADED: 'loaded', OPENED: 'opened', ERROR: 'error', CLOSED: 'closed' },
    BannerAd: 'BannerAd',
    BannerAdSize: { BANNER: 'BANNER', ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER', LARGE_ANCHORED_ADAPTIVE_BANNER: 'LARGE_ANCHORED_ADAPTIVE_BANNER' },
    TestIds: new Proxy({}, { get() { throw new Error('A production path must never fall back to test ad units'); } }),
    InterstitialAd: { createForAdRequest(unitId) {
      calls.create++;
      const subscriptions = new Map();
      const ad = {
        unitId, loaded: false, destroyed: false,
        addAdEventListener(event, callback) {
          if (!subscriptions.has(event)) subscriptions.set(event, new Set());
          subscriptions.get(event).add(callback);
          return () => subscriptions.get(event).delete(callback);
        },
        load() { calls.load++; if (options.loadThrows) throw new Error('Native load failure'); },
        show() {
          calls.show++;
          if (options.showThrows) throw new Error('Synchronous native show failure');
          if (options.showRejects) return Promise.reject(new Error('Native show rejected'));
          return Promise.resolve();
        },
        destroy() { calls.destroy++; ad.destroyed = true; subscriptions.clear(); },
        emit(event, payload) {
          if (event === 'loaded') ad.loaded = true;
          if (event === 'closed' || event === 'error') ad.loaded = false;
          for (const callback of [...(subscriptions.get(event) ?? [])]) callback(payload);
        },
        callbacks(event) { return [...(subscriptions.get(event) ?? [])]; },
        get listeners() { return [...subscriptions.values()].reduce((total, callbacks) => total + callbacks.size, 0); },
      };
      ads.push(ad); return ad;
    } },
  };
  const moduleMocks = {
    'react-native': { AppState, Platform: { OS: options.platform ?? 'android' }, StyleSheet: { create: value => value }, View: 'View', Text: 'Text' },
    'expo-constants': { __esModule: true, default: { expoGoConfig: options.expoGo ? {} : null, executionEnvironment: options.expoGo ? 'storeClient' : 'bare', expoConfig: {} } },
    'expo-network': { useNetworkState: () => network },
  };
  Object.defineProperty(moduleMocks, 'react-native-google-mobile-ads', { enumerable: true, get() {
    calls.imports++;
    return options.importError ?? sdk;
  } });
  return {
    calls, ads, sdk, network, AppState, moduleMocks, time,
    globals: { ...time, __DEV__: false, process: { env: {
      EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID: options.noIds ? '' : 'ca-app-pub-1234567890123456/1234567890',
      EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID: options.noIds ? '' : 'ca-app-pub-1234567890123456/9876543210',
      EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: '', EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: '',
    } } },
    background(state) { AppState.currentState = state; for (const callback of [...listeners]) callback(state); },
  };
}

function nativeHarness(options = {}) {
  const native = nativeMocks(options), state = hooks();
  native.moduleMocks.react = state.react;
  const runtime = load('components/admobRuntime.native.ts', native.moduleMocks, native.globals);
  const hookMocks = Object.create(native.moduleMocks);
  hookMocks['./admobRuntime.native'] = runtime;
  const hook = load('components/useAdMobAds.native.ts', hookMocks, native.globals);
  return {
    ...native, runtime,
    render: () => state.render(hook.default),
    unmount: () => state.unmount(),
    async warm() { this.render(); await settle(); this.render(); return this; },
  };
}

async function checkRuntime() {
  const shared = nativeHarness();
  await Promise.all([shared.runtime.prepareAdMobRuntime(), shared.runtime.prepareAdMobRuntime(), shared.runtime.prepareAdMobRuntime()]);
  assert.equal(shared.calls.imports, 1, 'Concurrent users must share one lazy SDK import');
  assert.equal(shared.calls.consent, 1, 'Concurrent banner/interstitial users must gather consent only once');
  assert.equal(shared.calls.initialize, 1, 'The SDK must initialize only once');
  assert.equal(shared.runtime.getAdMobSnapshot().canRequestAds, true);
  assert.equal(shared.runtime.getAdMobUnitId('banner', shared.sdk), 'ca-app-pub-1234567890123456/1234567890');
  assert.equal(shared.runtime.getAdMobUnitId('interstitial', shared.sdk), 'ca-app-pub-1234567890123456/9876543210');

  for (const options of [{ expoGo: true }, { platform: 'web' }, { noIds: true }]) {
    const disabled = nativeHarness(options); await disabled.warm();
    assert.equal(disabled.calls.imports, 0, 'Unsupported runtimes and missing production IDs must not import the native SDK');
    assert.equal(disabled.calls.load, 0);
    assert.equal(disabled.render().showCompletionAd('study:1'), false);
    disabled.unmount();
  }
  for (const condition of ['offline', 'background']) {
    const disabled = nativeHarness();
    if (condition === 'offline') disabled.network.isInternetReachable = false;
    else disabled.AppState.currentState = 'background';
    await disabled.warm();
    assert.equal(disabled.calls.imports, 0, `No SDK import during an initial ${condition} state`);
    disabled.unmount();
  }
  for (const options of [
    { importError: new Error('Native module missing') },
    { initializeError: new Error('SDK initialization failed') },
    { canRequestAds: false },
    { consentError: new Error('Consent update failed'), canRequestAds: false },
  ]) {
    const unavailable = nativeHarness(options); await unavailable.warm();
    assert.equal(unavailable.calls.load, 0, 'Import/consent/initialization failures must prevent requests without throwing');
    assert.equal(unavailable.render().showCompletionAd('study:1'), false);
    unavailable.unmount();
  }
  const retryOptions = { initializeError: new Error('Temporary SDK failure') };
  const recovery = nativeHarness(retryOptions); await recovery.warm();
  retryOptions.initializeError = null;
  await recovery.runtime.prepareAdMobRuntime(); recovery.render();
  assert.equal(recovery.calls.initialize, 2, 'A failed initialization must permit a later retry');
  assert.equal(recovery.calls.consent, 1);
  assert.equal(recovery.calls.load, 1);
  recovery.unmount();

  const waiting = deferred(), pending = nativeHarness({ initialization: waiting });
  await pending.warm();
  const completion = pending.render();
  assert.equal(completion.showCompletionAd('study:early'), false, 'A result cannot wait on pending SDK initialization');
  pending.unmount(); waiting.resolve([]); await settle();
  assert.equal(pending.calls.create, 0, 'A late initialization cannot create ads for an unmounted hook');
  assert.equal(pending.calls.show, 0);
}

async function checkInterstitial() {
  const session = nativeHarness(); await session.warm();
  let result = session.render();
  assert.equal(session.calls.load, 1);
  assert.equal(result.showCompletionAd('study:missed'), false, 'An unready completion is skipped immediately');
  session.ads[0].emit('loaded'); session.render(); await settle();
  assert.equal(session.calls.show, 0, 'LOADED must never auto-show a previously skipped completion');
  assert.equal(result.showCompletionAd('study:missed'), false, 'A skipped completion stays consumed after loading');
  assert.equal(result.showCompletionAd('study:ready'), true);
  assert.equal(result.showCompletionAd('study:ready'), false);
  assert.equal(result.showCompletionAd('quiz:overlap'), false, 'A second completion cannot overlap a showing ad');
  assert.equal(session.calls.show, 1);
  session.background('background'); session.render();
  assert.equal(session.ads[0].destroyed, false, 'AdActivity backgrounding must not destroy a showing interstitial');
  session.ads[0].emit('closed'); session.render();
  assert.equal(session.ads[0].destroyed, true);
  assert.equal(session.ads[0].listeners, 0);
  session.background('active'); session.render(); await settle(); session.render();
  assert.equal(session.calls.load, 2, 'Closing an ad must prepare fresh inventory');
  session.ads.at(-1).emit('loaded');
  result = session.render();
  assert.equal(result.showCompletionAd('quiz:overlap'), false, 'An overlapping skipped completion cannot become a delayed popup');
  assert.equal(result.showCompletionAd('quiz:next'), true);
  assert.equal(session.calls.show, 2);
  session.unmount();
  assert.equal(session.ads.at(-1).destroyed, true);

  for (const transition of ['offline', 'background', 'unmount']) {
    const stopped = nativeHarness(); await stopped.warm();
    const ready = stopped.render(), ad = stopped.ads[0]; ad.emit('loaded');
    const lateLoaded = ad.callbacks('loaded')[0], lateError = ad.callbacks('error')[0];
    if (transition === 'offline') { stopped.network.isConnected = false; stopped.render(); }
    if (transition === 'background') { stopped.background('background'); stopped.render(); }
    if (transition === 'unmount') stopped.unmount();
    assert.equal(ready.showCompletionAd(`study:${transition}`), false);
    lateLoaded(); lateError(); await settle();
    assert.equal(stopped.calls.show, 0, `No late popup after ${transition}`);
    assert.equal(ad.destroyed, true);
    if (transition !== 'unmount') stopped.unmount();
  }

  const expired = nativeHarness(); await expired.warm();
  expired.ads[0].emit('loaded'); expired.time.advance(56 * 60_000);
  assert.equal(expired.render().showCompletionAd('quiz:stale'), false, 'Stale cached inventory must never show');
  expired.render();
  assert.equal(expired.ads[0].destroyed, true);
  assert.equal(expired.calls.load, 2, 'Stale inventory must be replaced for a future completion');
  expired.ads[1].emit('loaded');
  assert.equal(expired.render().showCompletionAd('quiz:stale'), false);
  assert.equal(expired.calls.show, 0);
  expired.unmount();

  for (const options of [{ showThrows: true }, { showRejects: true }]) {
    const failed = nativeHarness(options); await failed.warm();
    const result = failed.render(); failed.ads[0].emit('loaded');
    assert.doesNotThrow(() => result.showCompletionAd('study:failed'));
    await settle();
    assert.equal(failed.ads[0].destroyed, true, 'Both synchronous and asynchronous show failures retire the ad');
    assert.equal(result.showCompletionAd('study:failed'), false);
    options.showThrows = false; options.showRejects = false;
    failed.time.advance(60_000); failed.render();
    failed.ads.at(-1).emit('loaded');
    assert.equal(failed.render().showCompletionAd('quiz:recovered'), true, 'A failed show cannot lock all future completions');
    failed.unmount();
  }

  const loadFailure = nativeHarness({ loadThrows: true }); await loadFailure.warm();
  assert.equal(loadFailure.calls.load, 1);
  loadFailure.render(); loadFailure.render();
  assert.equal(loadFailure.calls.load, 1, 'Ordinary rerenders cannot trigger a no-fill retry storm');
  loadFailure.time.advance(59_000); loadFailure.render();
  assert.equal(loadFailure.calls.load, 1);
  loadFailure.time.advance(1000); loadFailure.render();
  assert.equal(loadFailure.calls.load, 2, 'A load failure retries with bounded backoff');
  loadFailure.unmount(); loadFailure.time.advance(1_000_000);
  assert.equal(loadFailure.calls.load, 2, 'Unmount cancels retry timers');

  const errorEvent = nativeHarness(); await errorEvent.warm();
  errorEvent.ads[0].emit('error', new Error('No fill')); errorEvent.render();
  assert.equal(errorEvent.ads[0].destroyed, true, 'SDK ERROR events retire failed inventory');
  errorEvent.time.advance(60_000); errorEvent.render();
  assert.equal(errorEvent.calls.load, 2);
  errorEvent.unmount();
}

async function checkPrivacyAndBanner() {
  const form = deferred(), options = { privacyRequired: true, privacy: form };
  const privacy = nativeHarness(options); await privacy.warm();
  privacy.ads[0].emit('loaded');
  const result = privacy.render();
  assert.equal(result.privacyOptionsRequired, true);
  const showingForm = result.showPrivacyOptions(); await settle(); privacy.render();
  assert.equal(privacy.calls.privacy, 1);
  assert.equal(privacy.ads[0].destroyed, true, 'Changing consent must retire inventory requested with old signals');
  assert.equal(privacy.render().showCompletionAd('study:privacy'), false);
  options.canRequestAds = false; form.resolve({}); await showingForm; privacy.render();
  assert.equal(privacy.runtime.getAdMobSnapshot().canRequestAds, false);
  assert.equal(privacy.calls.load, 1, 'Revoked consent prevents additional ad loads');
  privacy.unmount();

  const native = nativeMocks(), state = hooks();
  state.react.Component = class {
    constructor(props) { this.props = props; this.state = {}; }
  };
  const current = { adsModule: native.sdk, online: true, active: true, canRequestAds: true, privacyOptionsBusy: false, consentVersion: 0 };
  const banner = load('components/AdMobBanner.native.tsx', {
    react: state.react,
    'react-native': { ...native.moduleMocks['react-native'], useWindowDimensions: () => ({ width: 320, height: 640 }) },
    './admobRuntime.native': { useAdMobRuntime: () => current, getAdMobUnitId: () => 'ca-app-pub-1234567890123456/1234567890' },
  }, native.globals);
  let tree = state.render(banner.default);
  const renderSlot = () => state.render(() => tree.props.children.type(tree.props.children.props));
  let slot = renderSlot();
  let ad = nodes(slot).find(node => node.type === 'BannerAd');
  assert(ad, 'Eligible native builds must mount the footer banner');
  assert.equal(ad.props.size, 'BANNER');
  assert.equal(slot.props.style[1].paddingHorizontal, 0, 'A fixed 320dp banner must fit a 320dp viewport');
  ad.props.onAdFailedToLoad();
  assert.equal(renderSlot(), null, 'A failed banner must collapse instead of blocking content');
  current.online = false;
  assert.equal(state.render(banner.default), null);
  state.reset(); // Hiding the outer banner unmounts its failed child in React.
  current.online = true; tree = state.render(banner.default); slot = renderSlot();
  ad = nodes(slot).find(node => node.type === 'BannerAd');
  assert(ad, 'Connectivity recovery permits a fresh banner');
  for (const key of ['online', 'active', 'canRequestAds']) {
    current[key] = false;
    assert.equal(state.render(banner.default), null, `Banner must hide while ${key} is false`);
    current[key] = true; state.render(banner.default);
  }
  current.privacyOptionsBusy = true;
  assert.equal(state.render(banner.default), null, 'A privacy form suspends banner requests');
  const boundary = new tree.type(tree.props);
  boundary.state = tree.type.getDerivedStateFromError(new Error('Native banner render failed'));
  assert.equal(boundary.render(), null, 'Native banner render errors have a local fallback');
  state.unmount();

  const web = load('components/useAdMobAds.ts', {});
  assert.equal(web.default().showCompletionAd('quiz:web'), false, 'Web must remain a native-SDK-free no-op');
  assert.equal(load('components/AdMobBanner.tsx', {}).default(), null);
}

function appHarness() {
  const state = hooks(), time = clock(), completions = [];
  const bank = Object.fromEntries(['beginner', 'intermediate', 'advanced', 'upperAdvanced', 'master'].map(level => [level,
    Array.from({ length: 35 }, (_, index) => ({ word: `${level}${index}`, meaning: `뜻${index}`, example: '' })),
  ]));
  const wordLevels = Object.fromEntries(Object.entries(bank).flatMap(([level, words]) => words.map(word => [word.word, level])));
  const ads = {
    showCompletionAd: key => { completions.push(key); return false; },
    privacyOptionsRequired: false, privacyOptionsBusy: false, showPrivacyOptions: () => Promise.resolve(),
  };
  const mocks = {
    react: state.react,
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '@react-native-async-storage/async-storage': { getItem: () => Promise.resolve('true'), setItem: () => Promise.resolve() },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 384, height: 832, fontScale: 1, scale: 1 }) },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    './components/useAdMobAds': { __esModule: true, default: () => ads, useAdMobAds: () => ads },
    './components/AdMobBanner': 'AdMobBanner', './components/HomeCardPager': 'HomeCardPager',
    './components/WordSpeaker': 'WordSpeaker', './components/StudySwipeCard': 'StudySwipeCard',
    './vocabulary': { WORD_LEVEL: wordLevels, wordsForLevel: level => bank[level] },
  };
  const app = load('App.tsx', mocks, { ...time });
  let tree;
  return {
    time, completions,
    render() { tree = state.render(app.default); return tree; },
    button(label) {
      const found = nodes(tree).find(node => node.type === 'Pressable' && text(node).includes(label));
      assert(found, `Missing app action: ${label}`);
      return found.props.onPress;
    },
    known() {
      const card = nodes(tree).find(node => node.type === 'StudySwipeCard');
      assert(card, 'The study screen must expose its card action');
      return card.props.onKnown;
    },
    get text() { return text(tree); },
    unmount: () => state.unmount(),
  };
}

async function checkCompletionFlows() {
  const app = appHarness();
  app.render(); app.time.advance(1100); await settle(); app.render();
  app.button('학습하기')(); app.render();
  app.known()(); app.render(); app.button('나가기')(); app.render();
  assert.equal(app.completions.length, 0, 'Leaving study early is not a completion');
  app.button('학습하기')(); app.render();
  for (let index = 0; index < 29; index++) { app.known()(); app.render(); }
  assert.equal(app.completions.length, 0, 'Intermediate study cards must not request fullscreen ads');
  const finalKnown = app.known(); finalKnown(); finalKnown(); app.render();
  assert.match(app.text, /학습 완료/);
  assert.equal(app.completions.length, 1, 'The last card attempts one ad even when it receives duplicate callbacks');
  app.render(); app.render();
  assert.equal(app.completions.length, 1, 'Result rerenders never repeat the completion event');
  const firstStudyKey = app.completions[0];
  app.button('홈으로')(); app.render();
  app.button('학습하기')(); app.render();
  for (let index = 0; index < 30; index++) { app.known()(); app.render(); }
  assert.equal(app.completions.length, 2);
  assert.notEqual(app.completions[1], firstStudyKey, 'A fresh study session needs a fresh completion key');
  app.button('홈으로')(); app.render();
  app.button('1분 퀴즈')(); app.render();
  assert.equal(app.completions.length, 2, 'Quiz countdown does not request a fullscreen ad');
  app.time.advance(3000); app.render();
  app.time.advance(60_000); app.render();
  assert.equal(app.completions.length, 3, 'Quiz timeout attempts exactly one completion ad');
  const quizKey = app.completions[2];
  assert(!app.completions.slice(0, 2).includes(quizKey), 'Study and quiz completion keys cannot collide');
  app.render(); app.time.advance(60_000); app.render();
  assert.equal(app.completions.length, 3, 'A cleared quiz timer cannot attempt another ad');
  app.button('다시 도전하기')(); app.render();
  app.time.advance(3000); app.render(); app.time.advance(60_000); app.render();
  assert.equal(app.completions.length, 4);
  assert.notEqual(app.completions[3], quizKey, 'A retried quiz gets a fresh completion key');
  app.unmount();

  const abandonedQuiz = appHarness();
  abandonedQuiz.render(); abandonedQuiz.time.advance(1100); await settle(); abandonedQuiz.render();
  abandonedQuiz.button('1분 퀴즈')(); abandonedQuiz.render();
  abandonedQuiz.time.advance(3000); abandonedQuiz.render(); abandonedQuiz.unmount();
  abandonedQuiz.time.advance(60_000);
  assert.equal(abandonedQuiz.completions.length, 0, 'Unmounting an unfinished quiz cancels its completion timer');
}

function checkBuildConfiguration() {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  const ads = app.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads')?.[1];
  assert(ads, 'The native AdMob plugin must be configured');
  assert.match(ads.androidAppId, /^ca-app-pub-\d{16}~\d{10}$/);
  assert(!ads.androidAppId.startsWith('ca-app-pub-3940256099942544~'), 'Production must use the registered Android application ID');
  assert.equal(ads.delayAppMeasurementInit, true, 'Defer measurement until the consent flow');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_ADMOB_TEST_ADS, '0', 'Play builds must explicitly use configured live units');
  assert.equal(eas.build.adtest.env.EXPO_PUBLIC_ADMOB_TEST_ADS, '1', 'The adtest profile must explicitly use test units');
  assert.notEqual(eas.build.production.extends, 'adtest', 'Production must not inherit the test profile');
}

(async () => {
  checkBuildConfiguration();
  await checkRuntime();
  await checkInterstitial();
  await checkPrivacyAndBanner();
  await checkCompletionFlows();
  console.log('AdMob checks passed: shared consent/init, safe failures, completion-only/once-only display, no delayed popup, lifecycle/offline cleanup, cache expiry, retry, privacy changes, banner recovery, and web no-op.');
})().catch(error => { console.error(error); process.exitCode = 1; });
