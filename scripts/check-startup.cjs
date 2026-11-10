const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { version } = require('../package.json');

const root = path.resolve(path.dirname(module.filename), '..');
const source = fs.readFileSync(path.join(root, 'components/AppBootstrap.tsx'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const jsx = (type, props, key) => ({ type, props: props || {}, key });
class MockComponent {
  constructor(props) { this.props = props; this.state = {}; }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  // Keep the simulated async module promise intact through TypeScript's __importStar helper.
  Object.defineProperty(promise, '__esModule', { value: true });
  return { promise, resolve, reject };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(loadApp) {
  const states = [], effects = [];
  let cursor = 0, pending = [], stateWrites = 0, appLoads = 0;
  const react = {
    Component: MockComponent,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], next => {
        stateWrites++;
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      }];
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        pending.push(() => {
          previous?.cleanup?.();
          effects[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const context = { exports: {}, Promise, Error, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return {
      ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value },
    };
    if (name === '../package.json') return { version };
    if (name === '../App') { appLoads++; return loadApp(appLoads); }
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(code, context, { filename: 'AppBootstrap.test.js' });
  return {
    exports: context.exports,
    render() {
      cursor = 0; pending = [];
      const tree = context.exports.default();
      for (const effect of pending) effect();
      return tree;
    },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
    get appLoads() { return appLoads; },
    get stateWrites() { return stateWrites; },
  };
}

function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree.type === 'function' && !tree.type.prototype?.render) return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (typeof tree.type === 'function' && !tree.type.prototype?.render) return text(tree.type(tree.props));
  return text(tree.props.children);
}
function assertFailure(tree, message) {
  assert.match(text(tree), /앱을 시작하지 못했어요/);
  assert(text(tree).includes(version), 'Failure screen must identify the installed version');
  const copyable = nodes(tree).find(node => node.type === 'Text' && node.props.selectable === true);
  assert(copyable, 'Failure details must be selectable for users without USB debugging');
  assert(text(copyable).includes(message), 'Original failure message must be visible and copyable');
  const retry = nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button');
  assert(retry && typeof retry.props.onPress === 'function', 'Failure must expose a retry action');
  return retry.props.onPress;
}

(async () => {
  function ReadyApp() { return jsx('Text', { children: 'Loaded app' }); }
  const loading = deferred();
  const success = harness(() => loading.promise);
  let tree = success.render();
  assert.equal(success.appLoads, 0, 'App evaluation must be deferred until after the mounted root');
  assert(nodes(tree).some(node => node.type === 'ActivityIndicator'));
  await settle();
  assert.equal(success.appLoads, 1);
  loading.resolve({ default: ReadyApp });
  await settle();
  tree = success.render();
  assert.equal(tree.type, success.exports.StartupBoundary);
  assert.equal(tree.props.children.type, ReadyApp, 'Successful import must render the loaded default export');
  assert.equal(tree.key, 0);

  const first = deferred(), second = deferred();
  const recovery = harness(attempt => attempt === 1 ? first.promise : second.promise);
  recovery.render(); await settle();
  first.reject(new Error('Native module unavailable at import'));
  await settle();
  const retry = assertFailure(recovery.render(), 'Native module unavailable at import');
  retry();
  tree = recovery.render();
  assert(nodes(tree).some(node => node.type === 'ActivityIndicator'), 'Retry returns to loading');
  await settle();
  assert.equal(recovery.appLoads, 2, 'Retry must start a fresh loading attempt');
  second.resolve({ default: ReadyApp }); await settle();
  tree = recovery.render();
  assert.equal(tree.props.children.type, ReadyApp);
  assert.equal(tree.key, 1, 'Retry must remount the error boundary with a new key');

  const thrown = harness(() => { throw 'Plain-string module failure'; });
  thrown.render(); await settle();
  assertFailure(thrown.render(), 'Plain-string module failure');

  for (const rejectLate of [false, true]) {
    const late = deferred();
    const cleaned = harness(() => late.promise);
    cleaned.render(); await settle();
    cleaned.unmount();
    const before = cleaned.stateWrites;
    if (rejectLate) late.reject(new Error('Late rejected import'));
    else late.resolve({ default: ReadyApp });
    await settle();
    assert.equal(cleaned.stateWrites, before, 'Late import completion must not update an unmounted root');
  }

  let boundaryRetries = 0;
  const Boundary = success.exports.StartupBoundary;
  const boundary = new Boundary({ children: 'Healthy child', onRetry: () => { boundaryRetries++; } });
  assert.equal(boundary.render(), 'Healthy child');
  const renderFailure = new Error('App render failed');
  boundary.state = Boundary.getDerivedStateFromError(renderFailure);
  const boundaryRetry = assertFailure(boundary.render(), 'App render failed');
  boundaryRetry();
  assert.equal(boundaryRetries, 1);
  success.unmount(); recovery.unmount(); thrown.unmount();
  console.log('PASS: deferred App loading, visible/selectable import errors, retry recovery and boundary remount, late resolve/reject cleanup, and render-error fallback.');
  console.log('Scope: React hooks/render mock; does not exercise Android native startup, native fatal errors, or React reconciler error capture.');
})().catch(error => { console.error(error); process.exitCode = 1; });
