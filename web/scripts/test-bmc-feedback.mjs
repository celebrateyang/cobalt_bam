import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import { compile as compileSvelte } from 'svelte/compiler';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true } }).outputText;
const script = readFileSync(new URL('../src/lib/payments/BuyMeACoffeeFeedback.svelte', import.meta.url), 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const ast = ts.createSourceFile('feedback.ts', script, ts.ScriptTarget.Latest, true);
const declarations = ast.statements.filter(s => ts.isVariableStatement(s) && !s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(s => s.getText(ast)).join('\n');
const updates = ast.statements.filter(ts.isLabeledStatement).map(s => s.getText(ast)).join('\n');

function harness(fetch = async () => ({ ok: true, json: async () => ({ status: 'success', data: { status: 'CREATED' } }) }), existingStorage = new Map(), overrides = {}) {
    let rechecks = 0;
    const context = vm.createContext({
        userId: 'user_a', orderId: 1, kind: 'credit', returnCheck: 0, loading: false, statusError: false, savedFeedback: null,
        $clerkUser: { id: 'user_a' }, getClerkToken: async () => 'token', currentApiURL: () => 'https://api.example.com',
        recheck: async () => { rechecks++; return { status: 'CREATED' }; }, fetch, AbortSignal, summary: '', accountEmail: '', checkoutUrl: '', onCheckout() {}, onClose() {},
        window: { localStorage: { getItem: key => existingStorage.get(key), setItem: (key, value) => existingStorage.set(key, value) } },
        ...overrides,
    });
    vm.runInContext(compile(declarations), context);
    return {
        context, storage: existingStorage,
        read: expr => vm.runInContext(expr, context),
        update: values => { Object.assign(context, values); vm.runInContext(compile(updates), context); },
        submit: () => vm.runInContext('submit', context)(),
        call: (name, ...args) => vm.runInContext(name, context)(...args),
        rechecks: () => rechecks,
    };
}


test('overview offers help without opening a survey or submitting anything', async () => {
    let writes = 0;
    const h = harness(async () => { writes++; });
    assert.equal(h.read('screen'), 'overview');
    await h.submit();
    assert.equal(writes, 0);
    h.call('navigate', 'issues');
    h.call('selectReason', 'payment_issue', 'page');
    assert.equal(h.read('screen'), 'issues');
    assert.equal(h.read('selectedIssue'), 'page');
    assert.equal(writes, 0);
});

test('feedback needs explicit submission, allows changing a reason and retries safely', async () => {
    let requests = 0;
    let payload;
    let release;
    const h = harness(async (_url, options) => {
        requests++;
        payload = JSON.parse(options.body);
        if (requests === 1) throw new Error('offline');
        await new Promise(resolve => { release = resolve; });
        return { ok: true, json: async () => ({ status: 'success', data: { status: 'CREATED' } }) };
    });
    h.call('navigate', 'abandon');
    h.call('selectReason', 'price');
    h.call('selectReason', 'unclear');
    vm.runInContext('note = "Please explain the benefits"', h.context);
    assert.equal(requests, 0);
    await h.submit();
    assert.equal(h.read('failed'), true);
    assert.equal(h.read('screen'), 'abandon');
    assert.equal(h.read('note'), 'Please explain the benefits');
    const retry = h.submit();
    await new Promise(resolve => setImmediate(resolve));
    await h.submit();
    assert.equal(requests, 2);
    release();
    await retry;
    assert.deepEqual(payload, { reason: 'unclear', issue: '', note: 'Please explain the benefits' });
    assert.equal(h.read('done'), true);
    assert.equal(h.read('screen'), 'thanks');
});

test('paid action checks status first and never records a payment claim automatically', async () => {
    let writes = 0;
    const h = harness(async () => { writes++; });
    await h.call('checkPaid');
    assert.equal(h.rechecks(), 1);
    assert.equal(writes, 0);
    assert.equal(h.read('screen'), 'paid');
    assert.equal(h.read('checkedPending'), true);
    assert.equal(h.read('selectedReason'), 'paid_not_received');
    const failed = harness(undefined, new Map(), { recheck: async () => null, statusError: true });
    await failed.call('checkPaid');
    assert.equal(failed.read('checkedPending'), false);
    assert.equal(failed.read('selectedReason'), '');
    const rejected = harness(undefined, new Map(), { recheck: async () => { throw new Error('offline'); } });
    await rejected.call('checkPaid');
    assert.equal(rejected.read('checkFailed'), true);
    assert.equal(rejected.read('selectedReason'), '');
});

test('status failures, saved feedback, switched accounts and destroyed views cannot submit', async () => {
    for (const overrides of [{ statusError: true }, { savedFeedback: { reason: 'trust' } }, { $clerkUser: { id: 'user_b' } }]) {
        let writes = 0;
        const h = harness(async () => { writes++; }, new Map(), overrides);
        h.call('selectReason', 'trust');
        await h.submit();
        assert.equal(writes, 0);
    }
    let finishToken;
    let writes = 0;
    const h = harness(async () => { writes++; }, new Map(), { getClerkToken: () => new Promise(resolve => { finishToken = resolve; }) });
    h.call('selectReason', 'trust');
    const pending = h.submit();
    vm.runInContext('mounted = false', h.context);
    finishToken('token');
    await pending;
    assert.equal(writes, 0);
});

test('background polling preserves the chosen step, reason and note without blocking submission', async () => {
    const h = harness();
    h.call('navigate', 'issues');
    h.call('selectReason', 'payment_issue', 'page');
    vm.runInContext('note = "Checkout did not open"', h.context);
    for (const loading of [true, false, true]) {
        h.update({ loading });
        assert.equal(h.read('screen'), 'issues');
        assert.equal(h.read('selectedIssue'), 'page');
        assert.equal(h.read('note'), 'Checkout did not open');
    }
    await h.submit();
    assert.equal(h.read('screen'), 'thanks');
});

test('late manual checks cannot change a different step or a different user view', async () => {
    let finish;
    const h = harness(undefined, new Map(), { recheck: () => new Promise(resolve => { finish = resolve; }) });
    const check = h.call('checkPaid');
    h.call('navigate', 'abandon');
    finish({ status: 'CREATED' });
    await check;
    assert.equal(h.read('screen'), 'abandon');
    assert.equal(h.read('selectedReason'), '');
    assert.equal(h.read('checking'), false);
});

const renderComponent = async (initial = {}) => {
    const componentSource = readFileSync(new URL('../src/lib/payments/BuyMeACoffeeFeedback.svelte', import.meta.url), 'utf8');
    let initialized = script;
    for (const [name, value] of Object.entries(initial)) {
        const pattern = new RegExp(`(let ${name}(?:\\s*:[^=]+)?\\s*=)[^;]+;`);
        initialized = initialized.replace(pattern, (_match, prefix) => `${prefix} ${JSON.stringify(value)};`);
    }
    const prepared = componentSource.replace(/<script[^>]*>[\s\S]*?<\/script>/, `<script>${compile(initialized)}</script>`);
    const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const mocks = {
        'svelte/internal': import.meta.resolve('svelte/internal'), svelte: import.meta.resolve('svelte'),
        '$lib/i18n/translations': dataModule('export const t = {subscribe(fn) {fn(key => key); return () => {};}};'),
        '$lib/state/clerk': dataModule('export const clerkUser = {subscribe(fn) {fn({id:"user_a"}); return () => {};}}; export const getClerkToken = async () => "token";'),
        '$lib/api/api-url': dataModule('export const currentApiURL = () => "https://api.example.com";'),
    };
    const compiled = compileSvelte(prepared, { generate: 'ssr', filename: 'Feedback.svelte' }).js.code
        .replace(/from (["'])([^"']+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(mocks[name] || name)}`);
    return (await import(dataModule(compiled))).default;
};

test('rendered overview stays compact and stable during polling', async () => {
    const component = await renderComponent();
    const renders = [false, true, false].map(loading => component.render({
        userId: 'user_a', orderId: 1, kind: 'credit', summary: '500 credits - $1.00', loading,
        checkoutUrl: 'https://buymeacoffee.com/example/e/1', recheck: async () => {},
    }).html);
    for (const html of renders) {
        assert.match(html, /auth\.bmc_return_paid/);
        assert.match(html, /auth\.bmc_return_problem/);
        assert.match(html, /auth\.bmc_return_not_now/);
        assert.doesNotMatch(html, /<textarea|auth\.bmc_feedback_reason_trust|auth\.bmc_feedback_reason_price/);
        assert.match(html, /target="_blank"/);
    }
    assert.equal(renders[0], renders[1]);
    assert.equal(renders[1], renders[2]);
});

test('rendered second step provides selections and reveals optional note and submit only after a choice', async () => {
    const unselected = await renderComponent({ screen: 'abandon' });
    const selected = await renderComponent({ screen: 'abandon', selectedReason: 'price' });
    const props = { userId: 'user_a', orderId: 1, kind: 'credit', recheck: async () => {} };
    const first = unselected.render(props).html;
    const second = selected.render(props).html;
    assert.match(first, /auth\.bmc_feedback_reason_price/);
    assert.match(first, /auth\.bmc_feedback_reason_trust/);
    assert.doesNotMatch(first, /<textarea|auth\.bmc_return_submit/);
    assert.match(second, /<textarea/);
    assert.match(second, /auth\.bmc_return_submit/);
    assert.match(second, /aria-pressed="true"/);
    assert.match(second, /<details class="note/);
});
