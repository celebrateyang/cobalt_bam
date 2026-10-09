import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const ui = readFileSync(new URL('../src/lib/points/ui.ts', import.meta.url), 'utf8');
const uiAst = ts.createSourceFile('ui.ts', ui, ts.ScriptTarget.Latest, true);
const uiSource = uiAst.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(uiAst)).join('\n');
const compiledUi = ts.transpileModule(uiSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
    .outputText.replace(/^export /gm, '');

function dialogHarness(lang) {
    const calls = { dialogs: [], navigations: [], contacts: [], events: [] };
    const context = vm.createContext({
        URLSearchParams, Number, Date, setTimeout,
        page: { params: { lang } }, get: value => value,
        t: (key, args) => args ? `${key}:${args.current}:${args.required}` : key,
        createDialog: dialog => calls.dialogs.push(dialog),
        trackTopupPrompt: (...args) => calls.events.push(args),
        goto: async path => calls.navigations.push(path),
        WHATSAPP_CONTACT_URL: 'https://wa.me/qr/JGD6D7RPQISIO1',
        window: { open: (...args) => calls.contacts.push(args) },
    });
    vm.runInContext(compiledUi, context);
    return { calls, context, show: (current, required) => vm.runInContext('showPointsInsufficientDialog', context)(current, required, null, `/${lang}/`) };
}

for (const lang of ['en', 'de', 'ja', 'th']) {
    test(`${lang}: insufficient points offers WhatsApp, 3-day pass and fixed $1.99 credits`, async () => {
        const h = dialogHarness(lang);
        h.show(10, 5000);
        const dialog = h.calls.dialogs[0];
        assert.deepEqual(Array.from(dialog.buttons, b => b.text), [
            'dialog.points_insufficient.whatsapp',
            'dialog.points_insufficient.membership_3day',
            'dialog.points_insufficient.credit_199',
        ]);
        assert.deepEqual(Array.from(dialog.buttons, b => b.main), [false, true, false]);
        dialog.buttons[0].action();
        assert.deepEqual(h.calls.contacts[0], ['https://wa.me/qr/JGD6D7RPQISIO1', '_blank', 'noopener,noreferrer']);
        dialog.buttons[1].action();
        dialog.buttons[2].action();
        await Promise.resolve();
        const [membership, credits] = h.calls.navigations.map(path => new URL(path, 'https://example.com'));
        assert.equal(membership.searchParams.get('checkout'), 'membership_3day');
        assert.equal(membership.searchParams.get('section'), 'membership');
        assert.equal(credits.searchParams.get('checkout'), 'credit_199');
        assert.equal(credits.searchParams.get('section'), 'topup');
        assert.equal(credits.searchParams.get('needed'), null);
        assert.equal(credits.searchParams.get('redirect'), `/${lang}/`);
    });
}

test('Chinese insufficient-points offers keep their existing flow', () => {
    const h = dialogHarness('zh');
    h.show(0, 200);
    assert.deepEqual(Array.from(h.calls.dialogs[0].buttons, b => b.text), ['button.invite_points', 'button.membership', 'button.buy_points']);
    assert.equal(h.calls.dialogs[0].buttons[1].main, true);
});

const account = readFileSync(new URL('../src/routes/[lang]/account/+page.svelte', import.meta.url), 'utf8');
const accountAst = ts.createSourceFile('account.ts', account.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1], ts.ScriptTarget.Latest, true);
const checkout = accountAst.statements.find(s => ts.isVariableStatement(s) &&
    s.declarationList.declarations.some(d => d.name.getText(accountAst) === 'consumeRecommendedCheckoutIntent'));
const compiledCheckout = ts.transpileModule(checkout.getText(accountAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function checkoutHarness(intent, products) {
    const payments = [];
    const context = vm.createContext({
        browser: true, checkoutIntentHandled: false, $clerkUser: { id: 'test' },
        $page: { url: new URL(`https://example.com/en/account?checkout=${intent}&needed=9000`) },
        window: { location: { href: 'https://example.com/en/account' }, history: { replaceState() {} } },
        URL, selectedPaymentProvider: 'buymeacoffee',
        membershipProductsLoading: false, membershipProducts: products,
        creditProductsLoading: false, creditProducts: products, recommendedValueProductKey: 'buymeacoffee_usd_499',
        startBuyMeACoffeePay: (...args) => payments.push(args),
    });
    vm.runInContext(compiledCheckout, context);
    vm.runInContext('consumeRecommendedCheckoutIntent()', context);
    return payments;
}

test('$1.99 offer selects 1200 points even when the gap exceeds that package', () => {
    assert.deepEqual(checkoutHarness('credit_199', [
        { key: 'buymeacoffee_usd_499', points: 4000 },
        { key: 'buymeacoffee_usd_199', points: 1200 },
        { key: 'buymeacoffee_usd_999', points: 10000 },
    ]), [['buymeacoffee_usd_199']]);
});

test('3-day offer creates the short membership purchase, not monthly membership', () => {
    assert.deepEqual(checkoutHarness('membership_3day', [
        { key: 'member_monthly_buymeacoffee' }, { key: 'member_3day_buymeacoffee' },
    ]), [['member_3day_buymeacoffee', 'membership']]);
});

test('an unavailable $1.99 package cannot silently create a higher-priced order', () => {
    assert.deepEqual(checkoutHarness('credit_199', [
        { key: 'buymeacoffee_usd_199', points: 1200, enabled: false },
        { key: 'buymeacoffee_usd_499', points: 4000 },
    ]), []);
});
