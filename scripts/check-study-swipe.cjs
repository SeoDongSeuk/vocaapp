// Exercise gesture decisions and delayed native callbacks without a device or extra dependencies.
// Native ScrollView responder arbitration still needs a device smoke check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(path.dirname(module.filename), '../components/StudySwipeCard.tsx'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props, key) => ({ type, props: props || {}, key });
const gesture = (values = {}) => ({ dx: 0, dy: 0, vx: 0, vy: 0, numberActiveTouches: 1, ...values });

function harness(onKnown = () => {}) {
  const hooks = [], animations = [], scheduled = [];
  let cursor = 0, pending = [], now = 0, responderCount = 0, handlers, tree;
  const props = { onKnown, children: [
    jsx('Pressable', { onPress: () => { taps.speech++; }, children: '발음 듣기' }),
    jsx('Pressable', { onPress: () => { taps.reveal++; }, children: '뜻 보기' }),
  ] };
  const taps = { speech: 0, reveal: 0 };
  const schedule = (delay, fn) => {
    const task = { at: now + delay, fn, cancelled: false };
    scheduled.push(task);
    return task;
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!hooks[index] || dependencies.some((value, i) => !Object.is(value, hooks[index].dependencies[i]))) {
        hooks[index] = { dependencies, value: factory() };
      }
      return hooks[index].value;
    },
    useLayoutEffect(callback, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        pending.push(() => {
          previous?.cleanup?.();
          hooks[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.stopAnimation(); this.value = value; }
    stopAnimation() { this.active?.stop(); }
  }
  const leaf = (value, config) => {
    let running = false, callback, timer;
    const animation = {
      start(done) {
        value?.stopAnimation();
        running = true; callback = done;
        if (value) value.active = animation;
        timer = schedule(config.duration ?? 250, () => {
          if (!running) return;
          running = false;
          if (value) { value.active = undefined; value.value = config.toValue; }
          callback?.({ finished: true });
        });
      },
      stop() {
        if (!running) return;
        running = false; timer.cancelled = true;
        if (value?.active === animation) value.active = undefined;
        callback?.({ finished: false });
      },
      lateFinish() { callback?.({ finished: true }); },
    };
    return animation;
  };
  const Animated = {
    Value, View: 'AnimatedView',
    timing: (value, config) => leaf(value, config),
    spring: (value, config) => leaf(value, config),
    delay: duration => leaf(null, { duration }),
    sequence(steps) {
      let running = false, callback, index = 0;
      const animation = {
        start(done) {
          running = true; callback = done; index = 0;
          const next = result => {
            if (!running) return;
            if (!result.finished || index === steps.length) { running = false; callback?.(result); return; }
            steps[index++].start(next);
          };
          next({ finished: true });
        },
        stop() {
          if (!running) return;
          running = false; steps[index - 1]?.stop(); callback?.({ finished: false });
        },
        lateFinish() { callback?.({ finished: true }); },
      };
      animations.push(animation);
      return animation;
    },
  };
  const context = { exports: {}, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return {
      Animated, View: 'View', Text: 'Text', StyleSheet: { create: value => value },
      PanResponder: { create(config) { responderCount++; handlers = config; return { panHandlers: config }; } },
    };
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(code, context, { filename: 'StudySwipeCard.test.js' });
  const test = {
    render(nextProps = {}) {
      Object.assign(props, nextProps); cursor = 0; pending = [];
      tree = context.exports.default(props);
      for (const effect of pending) effect();
      return tree;
    },
    layout(width) { tree.props.onLayout({ nativeEvent: { layout: { width } } }); },
    advance(duration) {
      const target = now + duration;
      for (;;) {
        scheduled.sort((a, b) => a.at - b.at);
        const index = scheduled.findIndex(task => !task.cancelled && task.at <= target);
        if (index === -1) break;
        const [task] = scheduled.splice(index, 1); now = task.at; task.fn();
      }
      now = target;
    },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
    get handlers() { return handlers; },
    get responderCount() { return responderCount; },
    get confirmation() { return animations.at(-1); },
    get offset() { return tree.props.children[0].props.style[1].transform[0].translateX.value; },
    get badge() { return tree.props.children[1]; },
    get children() { return tree.props.children[0].props.children; },
    taps,
  };
  test.render(); test.layout(368);
  return test;
}

function drag(test, values) {
  const state = gesture(values);
  test.handlers.onPanResponderGrant({}, state);
  test.handlers.onPanResponderMove({}, state);
  // PanResponder release runs after the last touch has ended.
  test.handlers.onPanResponderRelease({}, { ...state, numberActiveTouches: 0 });
}

const controls = harness();
assert.equal(controls.handlers.onStartShouldSetPanResponder({}, gesture()), false);
assert.equal(controls.handlers.onStartShouldSetPanResponderCapture({}, gesture()), false);
for (const state of [gesture(), gesture({ dx: -100 }), gesture({ dx: 5, dy: 1 }), gesture({ dx: 20, dy: 50 }), gesture({ dx: 30, dy: 26 }), gesture({ dx: 100, numberActiveTouches: 2 })]) {
  assert.equal(controls.handlers.onMoveShouldSetPanResponderCapture({}, state), false, 'Taps, left, vertical, and multi-touch must stay available to children');
}
assert.equal(controls.handlers.onMoveShouldSetPanResponderCapture({}, gesture({ dx: 12, dy: 1 })), true, 'An intentional right drag must be claimed before the nested scroll view scrolls');
for (const child of controls.children) child.props.onPress();
assert.equal(controls.taps.speech, 1); assert.equal(controls.taps.reveal, 1);
assert.equal(controls.badge.props.accessibilityElementsHidden, true);
assert.equal(controls.badge.props.importantForAccessibility, 'no-hide-descendants');

let known = 0;
const distance = harness(() => { known++; });
distance.layout(600);
drag(distance, { dx: 120, dy: 8, vx: 0.1 });
distance.render();
assert.equal(distance.badge.props.style[1].opacity.value, 1);
assert.equal(distance.badge.props.accessibilityElementsHidden, false);
assert.equal(distance.badge.props.children.props.children, '✓ 외웠어요');
assert.equal(known, 0, 'The confirmation must be shown before advancing');
distance.advance(120);
assert.equal(known, 0, 'Confirmation needs a readable pause');
const originalOffset = distance.offset;
distance.handlers.onPanResponderMove({}, gesture({ dx: 300 }));
assert.equal(distance.offset, originalOffset, 'New movement cannot mutate an accepted card');
distance.handlers.onPanResponderRelease({}, gesture({ dx: 180 }));
distance.advance(1000);
assert.equal(known, 1);
assert(distance.offset > 600, 'A wide card must move beyond its actual measured edge');
distance.confirmation.lateFinish();
distance.handlers.onPanResponderRelease({}, gesture({ dx: 180 }));
assert.equal(known, 1, 'Duplicate release/native completions cannot advance twice');

let flings = 0;
const fling = harness(() => { flings++; });
drag(fling, { dx: 40, dy: 3, vx: 0.8, vy: 0.04 });
fling.advance(1000);
assert.equal(flings, 1, 'A short deliberate right fling should advance');

for (const values of [
  { dx: 20, vx: 5 }, { dx: 40, vx: 0.1 }, { dx: -120, vx: -1 },
  { dx: 100, dy: 100, vx: 2 }, { dx: 40, dy: 3, vx: 0.8, vy: 2 },
]) {
  let advanced = 0;
  const rejected = harness(() => { advanced++; });
  drag(rejected, values); rejected.advance(1000);
  assert.equal(advanced, 0, `Invalid gesture must not advance: ${JSON.stringify(values)}`);
  assert.equal(rejected.offset, 0, 'Rejected gesture returns the card to its origin');
  drag(rejected, { dx: 120, vx: 0.1 }); rejected.advance(1000);
  assert.equal(advanced, 1, 'A rejected gesture must not lock the next valid attempt');
}

let cancelledKnown = 0;
const cancelled = harness(() => { cancelledKnown++; });
cancelled.handlers.onPanResponderGrant({}, gesture());
cancelled.handlers.onPanResponderMove({}, gesture({ dx: 120 }));
cancelled.handlers.onPanResponderTerminate({}, gesture({ dx: 120 }));
cancelled.handlers.onPanResponderRelease({}, gesture({ dx: 120, numberActiveTouches: 0 }));
cancelled.advance(1000);
assert.equal(cancelledKnown, 0, 'OS/parent cancellation never advances');
drag(cancelled, { dx: 120 });
const oldConfirmation = cancelled.confirmation;
oldConfirmation.stop();
cancelled.advance(1000);
assert.equal(cancelledKnown, 0, 'Interrupted animations never advance');
drag(cancelled, { dx: 120 });
oldConfirmation.lateFinish();
assert.equal(cancelledKnown, 0, 'A late completion from the cancelled attempt cannot advance the new attempt');
cancelled.advance(1000);
assert.equal(cancelledKnown, 1, 'Cancellation/interruption permits a clean retry');

let multiKnown = 0;
const multi = harness(() => { multiKnown++; });
multi.handlers.onPanResponderGrant({}, gesture());
multi.handlers.onPanResponderStart({}, gesture({ numberActiveTouches: 2 }));
multi.handlers.onPanResponderRelease({}, gesture({ dx: 120, numberActiveTouches: 0 }));
multi.advance(1000);
assert.equal(multiKnown, 0, 'Adding a second finger cancels the current gesture');

let stale = 0, latest = 0;
const rerender = harness(() => { stale++; });
drag(rerender, { dx: 120 });
rerender.render({ onKnown: () => { latest++; } });
assert.equal(rerender.responderCount, 1, 'Ordinary rerenders must not replace active gesture handlers');
rerender.advance(1000);
assert.equal(stale, 0); assert.equal(latest, 1, 'Completion must call the latest committed callback');

let afterUnmount = 0;
const removed = harness(() => { afterUnmount++; });
drag(removed, { dx: 120 });
const lateNative = removed.confirmation;
removed.unmount();
removed.advance(1000); lateNative.lateFinish();
assert.equal(afterUnmount, 0, 'Even a late finished:true native callback cannot affect an unmounted card');

console.log('Study swipe checks passed: right drag/fling, confirmation, one advance, tap/vertical/left rejection, cancellation/retry, wide layout, rerender, and unmount.');
