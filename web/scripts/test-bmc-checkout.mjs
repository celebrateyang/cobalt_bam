import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual account-page handlers with controlled network responses.
const page = readFileSync(new URL('../src/routes/[lang]/account/+page.svelte', import.meta.url), 'utf8');
const script = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const ast = ts.createSourceFile('account.ts', script, ts.ScriptTarget.Latest, true);
const names = ['clearActiveOrder', 'fetchOrderStatus', 'fetchMembershipOrderStatus', 'startBuyMeACoffeePay', 'restoreBuyMeACoffeeOrder',
    'rememberBuyMeACoffeeOrder', 'forgetBuyMeACoffeeOrder', 'recoverBuyMeACoffeeOrder',
    'copyBuyMeACoffeePaymentCode', 'openBuyMeACoffeeCheckout', 'refreshBuyMeACoffeeOnReturn'];
const handlers = ast.statements.filter(s => ts.isVariableStatement(s) &&
    s.declarationList.declarations.some(d => names.includes(d.name.getText(ast))))
    .map(s => s.getText(ast)).join('\n');
const compiled = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const order = (id, kind = 'credit') => ({ id, kind, provider: 'buymeacoffee', status: 'CREATED',
    out_trade_no: `${kind === 'credit' ? 'cpt' : 'mbr'}_${id}`, amount_fen: 799, currency: 'USD',
    points: 2000, product_key: 'old_product', plan_key: 'member_monthly', provider_data: { checkout_url: 'https://buymeacoffee.com/example/e/123' } });
const response = data => ({ ok: true, json: async () => ({ status: 'success', data }) });
const recoverySource = readFileSync(new URL('../src/lib/payments/buymeacoffee-recovery.ts', import.meta.url), 'utf8');
const recoveryJs = ts.transpileModule(recoverySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const recovery = await import(`data:text/javascript;base64,${Buffer.from(recoveryJs).toString('base64')}`);
function harness(fetch) {
    const entries = new Map();
    const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
    const events = [];
    const context = vm.createContext({ ...recovery, fetch, URL, console, document: { hidden: false },
    navigator: { clipboard: { writeText: async () => {} } }, window: {
        location: { href: 'https://example.com/en/account?bmc_order=1&bmc_kind=credit', origin: 'https://example.com' },
        history: { replaceState() {} },
        localStorage: storage,
    }, getClerkToken: async () => 'test', currentApiURL: () => 'https://api.example.com',
    getOrderAttribution: () => ({}), stopPolling() {}, startPolling() {},
    trackCheckoutStarted() {}, trackPurchaseCompleted() {}, fetchPoints() {}, maybeResumeAfterPayment() {},
    trackBuyMeACoffeeStep: (...args) => events.push(args),
    $page: { url: new URL('https://example.com/en/account') },
    $clerkUser: { id: 'user_a' }, activeOrder: null, buyMeACoffeeSavedOrderId: 1, buyMeACoffeeSavedKind: 'credit',
    purchaseLoading: false, purchaseErrorKey: '', purchaseNoticeKey: '', lastPaymentResumeKey: '',
    paymentViewVersion: 0, orderStatusLoading: false, buyMeACoffeeStatusError: false,
    buyMeACoffeePaymentCode: '', buyMeACoffeeCheckoutUrl: '', buyMeACoffeeCodeSaved: false,
    buyMeACoffeeCopyFailed: false, buyMeACoffeeStatusErrorTracked: false,
    buyMeACoffeeCheckoutOpened: false, buyMeACoffeeLastReturnCheck: 0,
    codeUrl: '', qrDataUrl: '', lastPointsUserId: null });
    vm.runInContext(compiled, context);
    return { context, storage, events, call: (name, ...args) => vm.runInContext(name, context)(...args) };
}
for (const kind of ['credit', 'membership']) {
    test(`an unpaid saved order does not prevent buying ${kind}`, async () => {
        const requests = [];
        const h = harness(async (url, options) => {
            requests.push({ url: String(url), options });
            return response({ order: order(2, kind), buymeacoffee: { checkoutUrl: 'https://buymeacoffee.com/example/e/123', paymentCode: `${kind}_2` } });
        });
        h.context.activeOrder = order(1);
        await h.call('startBuyMeACoffeePay', 'selected_product', kind);
        assert.equal(requests.length, 1);
        assert.match(requests[0].url, new RegExp(`/payments/${kind === 'membership' ? 'memberships' : 'credits'}/buymeacoffee$`));
        assert.equal(requests[0].options.method, 'POST');
        assert.equal(h.context.activeOrder.id, 2);
        assert.equal(h.context.activeOrder.kind, kind);
        assert.equal(h.context.buyMeACoffeeSavedOrderId, 2);
    });
}
test('a late response for the old order cannot replace the new membership', async () => {
    let release;
    const oldResponse = new Promise(resolve => { release = resolve; });
    const h = harness(async (_url, options) => options.method === 'POST'
        ? response({ order: order(2, 'membership'), buymeacoffee: { checkoutUrl: 'https://buymeacoffee.com/example/e/123', paymentCode: 'mbr_2' } })
        : oldResponse);
    const oldRequest = h.call('restoreBuyMeACoffeeOrder');
    await Promise.resolve();
    await h.call('startBuyMeACoffeePay', 'member_monthly_buymeacoffee', 'membership');
    release(response({ order: order(1) }));
    await oldRequest;
    assert.equal(h.context.activeOrder.id, 2);
    assert.equal(h.context.activeOrder.kind, 'membership');
    assert.equal(h.context.buyMeACoffeePaymentCode, 'mbr_2');
});
test('closing the payment window still permits reopening the saved order', async () => {
    const h = harness(async () => response({ order: order(1) }));
    h.context.activeOrder = order(1);
    h.call('clearActiveOrder');
    assert.equal(h.context.activeOrder, null);
    assert.equal(h.context.buyMeACoffeeSavedOrderId, 1);
    await h.call('restoreBuyMeACoffeeOrder');
    assert.equal(h.context.activeOrder.id, 1);
});

test('checkout click starts copying without waiting for clipboard permission', async () => {
    const h = harness(async () => response({}));
    let finishCopy;
    h.context.navigator.clipboard.writeText = () => new Promise(resolve => { finishCopy = resolve; });
    h.context.activeOrder = order(1);
    h.context.buyMeACoffeePaymentCode = 'cpt_1';
    h.context.buyMeACoffeeCheckoutUrl = 'https://buymeacoffee.com/example/e/123';
    assert.equal(h.call('openBuyMeACoffeeCheckout'), undefined);
    assert.equal(h.context.buyMeACoffeeCheckoutOpened, true);
    assert.equal(h.events[0][0], 'checkout_opened');
    assert.equal(h.context.buyMeACoffeeCodeSaved, false);
    finishCopy();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.context.buyMeACoffeeCodeSaved, true);
});

test('clipboard failure keeps checkout available and reports the failure', async () => {
    const h = harness(async () => response({}));
    h.context.activeOrder = order(1);
    h.context.buyMeACoffeePaymentCode = 'cpt_1';
    h.context.buyMeACoffeeCheckoutUrl = 'https://buymeacoffee.com/example/e/123';
    h.context.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    h.call('openBuyMeACoffeeCheckout');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.context.buyMeACoffeeCopyFailed, true);
    assert.equal(h.context.buyMeACoffeeCheckoutOpened, true);
    assert.equal(h.events[1][0], 'code_copy_failed');
});

test('late clipboard response cannot mark a replacement order copied', async () => {
    const h = harness(async () => response({}));
    let finishCopy;
    h.context.navigator.clipboard.writeText = () => new Promise(resolve => { finishCopy = resolve; });
    h.context.activeOrder = order(1);
    h.context.buyMeACoffeePaymentCode = 'cpt_1';
    const pending = h.call('copyBuyMeACoffeePaymentCode');
    h.call('clearActiveOrder');
    h.context.activeOrder = order(2);
    finishCopy();
    await pending;
    assert.equal(h.context.buyMeACoffeeCodeSaved, false);
});

test('fresh visit restores a pending reference inline without opening a modal', async () => {
    const requests = [];
    const h = harness(async url => { requests.push(String(url)); return response({ order: order(5) }); });
    recovery.saveBuyMeACoffeeOrder(h.storage, 'user_a', 5, 'credit');
    h.call('recoverBuyMeACoffeeOrder');
    await new Promise(resolve => setImmediate(resolve));
    assert.match(requests[0], /credits\/orders\/5$/);
    assert.equal(h.context.buyMeACoffeeSavedOrderId, 5);
    assert.equal(h.context.activeOrder, null);
});

test('paid recovery clears the stored reference', async () => {
    const h = harness(async () => response({ order: { ...order(5), status: 'PAID' } }));
    recovery.saveBuyMeACoffeeOrder(h.storage, 'user_a', 5, 'credit');
    h.context.buyMeACoffeeSavedOrderId = 5;
    await h.call('fetchOrderStatus', 5, false, false);
    assert.equal(recovery.readBuyMeACoffeeOrder(h.storage, 'user_a'), null);
    assert.equal(h.context.buyMeACoffeeSavedOrderId, 0);
});

test('return focus and visibility notifications share one immediate status request', async () => {
    let requests = 0;
    const h = harness(async () => { requests++; return response({ order: order(1) }); });
    h.context.activeOrder = order(1);
    h.context.buyMeACoffeeCheckoutOpened = true;
    h.call('refreshBuyMeACoffeeOnReturn');
    h.call('refreshBuyMeACoffeeOnReturn');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 1);
    assert.equal(h.events.filter(e => e[0] === 'returned').length, 1);
});

test('recovery is isolated by user and rejects expired or malformed records', () => {
    const h = harness(async () => response({}));
    recovery.saveBuyMeACoffeeOrder(h.storage, 'user_a', 4, 'membership');
    assert.equal(recovery.readBuyMeACoffeeOrder(h.storage, 'user_b'), null);
    assert.equal(recovery.readBuyMeACoffeeOrder(h.storage, 'user_a').id, 4);
    for (const value of ['invalid', JSON.stringify({ id: 4, kind: 'credit', savedAt: Date.now() - 8 * 86400000 }), JSON.stringify({ id: -1, kind: 'credit', savedAt: Date.now() })]) {
        h.storage.setItem('fsv_bmc_pending:user_a', value);
        assert.equal(recovery.readBuyMeACoffeeOrder(h.storage, 'user_a'), null);
    }
});

test('checkout URL only accepts the provider shop product pages', () => {
    assert.equal(recovery.safeBuyMeACoffeeCheckoutUrl('https://buymeacoffee.com/example/e/123'), 'https://buymeacoffee.com/example/e/123');
    for (const url of ['javascript:alert(1)', 'https://buymeacoffee.com.evil.test/example/e/123', 'https://evil.test/', 'https://user:pass@buymeacoffee.com/example/e/123']) {
        assert.equal(recovery.safeBuyMeACoffeeCheckoutUrl(url), '');
    }
});

test('the same pending package does not create another order', async () => {
    let requests = 0;
    const h = harness(async () => { requests++; return response({}); });
    h.context.activeOrder = { ...order(1), product_key: 'same_package' };
    await h.call('startBuyMeACoffeePay', 'same_package', 'credit');
    assert.equal(requests, 0);
    assert.equal(h.context.activeOrder.id, 1);
});

test('storage failures do not prevent checkout or URL-based recovery', async () => {
    const h = harness(async () => response({ order: order(2), buymeacoffee: { checkoutUrl: 'https://buymeacoffee.com/example/e/123', paymentCode: 'cpt_2' } }));
    Object.defineProperty(h.context.window, 'localStorage', { get() { throw new Error('disabled'); } });
    await h.call('startBuyMeACoffeePay', 'selected_product', 'credit');
    assert.equal(h.context.activeOrder.id, 2);
    assert.equal(h.context.purchaseErrorKey, '');
});

test('reading a historical paid order does not discard a different pending order', async () => {
    const h = harness(async () => response({ order: { ...order(5), status: 'PAID' } }));
    recovery.saveBuyMeACoffeeOrder(h.storage, 'user_a', 1, 'credit');
    await h.call('fetchOrderStatus', 5, false, false);
    assert.equal(recovery.readBuyMeACoffeeOrder(h.storage, 'user_a').id, 1);
    assert.equal(h.context.buyMeACoffeeSavedOrderId, 1);
});

test('a checkout response after switching accounts cannot populate the new account', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const h = harness(async () => pending);
    const request = h.call('startBuyMeACoffeePay', 'selected_product', 'credit');
    await Promise.resolve();
    h.call('clearActiveOrder');
    h.context.$clerkUser = { id: 'user_b' };
    finish(response({ order: order(2), buymeacoffee: { checkoutUrl: 'https://buymeacoffee.com/example/e/123', paymentCode: 'cpt_2' } }));
    await request;
    assert.equal(h.context.activeOrder, null);
    assert.equal(recovery.readBuyMeACoffeeOrder(h.storage, 'user_b'), null);
});
