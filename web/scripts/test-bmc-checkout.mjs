import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual account-page handlers with controlled network responses.
const page = readFileSync(new URL('../src/routes/[lang]/account/+page.svelte', import.meta.url), 'utf8');
const script = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const ast = ts.createSourceFile('account.ts', script, ts.ScriptTarget.Latest, true);
const names = ['clearActiveOrder', 'fetchOrderStatus', 'fetchMembershipOrderStatus', 'startBuyMeACoffeePay', 'restoreBuyMeACoffeeOrder'];
const handlers = ast.statements.filter(s => ts.isVariableStatement(s) &&
    s.declarationList.declarations.some(d => names.includes(d.name.getText(ast))))
    .map(s => s.getText(ast)).join('\n');
const compiled = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const order = (id, kind = 'credit') => ({ id, kind, provider: 'buymeacoffee', status: 'CREATED',
    out_trade_no: `${kind === 'credit' ? 'cpt' : 'mbr'}_${id}`, amount_fen: 799, currency: 'USD',
    points: 2000, plan_key: 'member_monthly', provider_data: { checkout_url: 'https://buymeacoffee.com/example' } });
const response = data => ({ ok: true, json: async () => ({ status: 'success', data }) });
function harness(fetch) {
    const context = vm.createContext({ fetch, URL, console, window: {
        location: { href: 'https://example.com/en/account?bmc_order=1&bmc_kind=credit', origin: 'https://example.com' },
        history: { replaceState() {} },
    }, getClerkToken: async () => 'test', currentApiURL: () => 'https://api.example.com',
    getOrderAttribution: () => ({}), stopPolling() {}, startPolling() {},
    trackCheckoutStarted() {}, trackPurchaseCompleted() {}, fetchPoints() {}, maybeResumeAfterPayment() {},
    $clerkUser: {}, activeOrder: null, buyMeACoffeeSavedOrderId: 1, buyMeACoffeeSavedKind: 'credit',
    purchaseLoading: false, purchaseErrorKey: '', purchaseNoticeKey: '', lastPaymentResumeKey: '',
    paymentViewVersion: 0, orderStatusLoading: false, buyMeACoffeeStatusError: false,
    buyMeACoffeePaymentCode: '', buyMeACoffeeCheckoutUrl: '', buyMeACoffeeCodeSaved: false,
    buyMeACoffeeCopyFailed: false, codeUrl: '', qrDataUrl: '', lastPointsUserId: null });
    vm.runInContext(compiled, context);
    return { context, call: (name, ...args) => vm.runInContext(name, context)(...args) };
}
for (const kind of ['credit', 'membership']) {
    test(`an unpaid saved order does not prevent buying ${kind}`, async () => {
        const requests = [];
        const h = harness(async (url, options) => {
            requests.push({ url: String(url), options });
            return response({ order: order(2, kind), buymeacoffee: { checkoutUrl: 'https://buymeacoffee.com/example', paymentCode: `${kind}_2` } });
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
        ? response({ order: order(2, 'membership'), buymeacoffee: { checkoutUrl: 'https://buymeacoffee.com/example', paymentCode: 'mbr_2' } })
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
