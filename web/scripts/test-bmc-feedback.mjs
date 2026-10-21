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
const helper = compile(readFileSync(new URL('../src/lib/payments/buymeacoffee-feedback.ts', import.meta.url), 'utf8').replace(/export /g, ''));

function harness(fetch = async () => ({ ok: true, json: async () => ({ status: 'success', data: { status: 'CREATED' } }) }), existingStorage = new Map(), overrides = {}) {
    let rechecks = 0;
    const context = vm.createContext({
        userId: 'user_a', orderId: 1, kind: 'credit', returnCheck: 0, loading: false, statusError: false, savedFeedback: null,
        $clerkUser: { id: 'user_a' }, getClerkToken: async () => 'token', currentApiURL: () => 'https://api.example.com',
        recheck: async () => { rechecks++; }, fetch, AbortSignal,
        window: { localStorage: { getItem: key => existingStorage.get(key), setItem: (key, value) => existingStorage.set(key, value) } },
        ...overrides,
    });
    vm.runInContext(helper + '\n' + compile(declarations), context);
    return {
        context, storage: existingStorage,
        read: expr => vm.runInContext(expr, context),
        update: values => { Object.assign(context, values); vm.runInContext(compile(updates), context); },
        submit: (reason, issue = '') => vm.runInContext('submit', context)(reason, issue),
        rechecks: () => rechecks,
    };
}

test('feedback opens once after return, survives remount and is isolated by user and order', () => {
    const h = harness();
    assert.equal(h.read('visible'), false);
    h.update({ returnCheck: 1 });
    assert.equal(h.read('visible'), true);
    vm.runInContext('visible = false', h.context);
    h.update({ returnCheck: 2 });
    assert.equal(h.read('visible'), false);
    const remount = harness(undefined, h.storage);
    remount.update({ returnCheck: 3 });
    assert.equal(remount.read('visible'), false);
    for (const overrides of [{ userId: 'user_b' }, { kind: 'membership' }, { orderId: 2 }]) {
        const other = harness(undefined, h.storage, overrides);
        other.update({ returnCheck: 1 });
        assert.equal(other.read('visible'), true);
    }
    const saved = harness(undefined, new Map(), { savedFeedback: { reason: 'trust' } });
    saved.update({ returnCheck: 1 });
    assert.equal(saved.read('visible'), false);
});

test('submission failures permit retry; duplicate clicks do not create duplicate requests', async () => {
    let requests = 0;
    let release;
    const h = harness(async () => {
        requests++;
        if (requests === 1) throw new Error('offline');
        await new Promise(resolve => { release = resolve; });
        return { ok: true, json: async () => ({ status: 'success', data: { status: 'CREATED' } }) };
    });
    await h.submit('trust');
    assert.equal(h.read('failed'), true);
    assert.equal(h.read('done'), false);
    const retry = h.submit('trust');
    await new Promise(resolve => setImmediate(resolve));
    await h.submit('trust');
    assert.equal(requests, 2);
    release();
    await retry;
    assert.equal(h.read('failed'), false);
    assert.equal(h.read('done'), true);
});

test('paid reports recheck status; failed status, switched accounts and destroyed views cannot submit', async () => {
    const h = harness();
    await h.submit('paid_not_received');
    assert.equal(h.rechecks(), 1);
    for (const overrides of [{ statusError: true }, { $clerkUser: { id: 'user_b' } }]) {
        let writes = 0;
        const blocked = harness(async () => { writes++; }, new Map(), overrides);
        await blocked.submit('trust');
        assert.equal(writes, 0);
    }
    let finishToken;
    let writes = 0;
    const late = harness(async () => { writes++; }, new Map(), { getClerkToken: () => new Promise(resolve => { finishToken = resolve; }) });
    const pending = late.submit('trust');
    vm.runInContext('mounted = false', late.context);
    finishToken('token');
    await pending;
    assert.equal(writes, 0);
});

test('background status polling does not block feedback submission or reset the note and issue selection', async () => {
    let submitted;
    const h = harness(async (_url, options) => {
        submitted = JSON.parse(options.body);
        return { ok: true, json: async () => ({ status: 'success', data: { status: 'CREATED' } }) };
    });
    h.update({ returnCheck: 1 });
    vm.runInContext('note = "Checkout did not open"; issuePicker = true', h.context);
    for (const loading of [true, false, true]) {
        h.update({ loading });
        assert.equal(h.read('visible'), true);
        assert.equal(h.read('issuePicker'), true);
        assert.equal(h.read('note'), 'Checkout did not open');
    }
    await h.submit('payment_issue', 'page');
    assert.equal(h.read('done'), true);
    assert.deepEqual(submitted, { reason: 'payment_issue', issue: 'page', note: 'Checkout did not open' });
});

test('rendered feedback form stays present while the parent toggles background polling', async () => {
    const componentSource = readFileSync(new URL('../src/lib/payments/BuyMeACoffeeFeedback.svelte', import.meta.url), 'utf8');
    const prepared = componentSource.replace(/<script[^>]*>[\s\S]*?<\/script>/, `<script>${compile(script)}</script>`);
    const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    const mocks = {
        'svelte/internal': import.meta.resolve('svelte/internal'),
        svelte: import.meta.resolve('svelte'),
        '$lib/i18n/translations': dataModule('export const t = {subscribe(fn) {fn(key => key); return () => {};}};'),
        '$lib/state/clerk': dataModule('export const clerkUser = {subscribe(fn) {fn({id:"user_a"}); return () => {};}}; export const getClerkToken = async () => "token";'),
        '$lib/api/api-url': dataModule('export const currentApiURL = () => "https://api.example.com";'),
        './buymeacoffee-feedback': dataModule(compile(readFileSync(new URL('../src/lib/payments/buymeacoffee-feedback.ts', import.meta.url), 'utf8'))),
    };
    const compiled = compileSvelte(prepared, { generate: 'ssr', filename: 'Feedback.svelte' }).js.code
        .replace(/from (["'])([^"']+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(mocks[name] || name)}`);
    const { default: component } = await import(dataModule(compiled));
    const renders = [false, true, false].map((loading, index) => component.render({
        userId: `render_${index}`, orderId: 1, kind: 'credit', returnCheck: 1, loading, recheck: async () => {},
    }).html);
    for (const html of renders) {
        assert.match(html, /<textarea/);
        assert.match(html, /auth\.bmc_feedback_reason_paid_not_received/);
        assert.match(html, /auth\.bmc_feedback_reason_not_now/);
        assert.doesNotMatch(html, /auth\.loading/);
    }
    assert.equal(renders[0], renders[1]);
    assert.equal(renders[1], renders[2]);
});

test('feedback suppression works without browser storage', () => {
    const h = harness(undefined, new Map(), { window: { get localStorage() { throw new Error('blocked'); } } });
    h.update({ returnCheck: 1 });
    assert.equal(h.read('visible'), true);
    assert.equal(h.read('wasSeen()'), true);
});
