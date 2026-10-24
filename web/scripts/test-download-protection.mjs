import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function loadFunction(path, name, globals) {
    let source = readFileSync(new URL(path, import.meta.url), 'utf8');
    if (path.endsWith('.svelte')) source = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
    const ast = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);
    const declaration = ast.statements.find(s => ts.isVariableStatement(s) &&
        s.declarationList.declarations.some(d => d.name.getText(ast) === name));
    assert.ok(declaration, name);
    const code = ts.transpileModule(declaration.getText(ast), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/^export /gm, '');
    const context = vm.createContext({ Number, Math, Date, ...globals });
    vm.runInContext(code, context);
    return vm.runInContext(name, context);
}

test('balance profile reads never activate; explicit download actions reuse the activation response', async () => {
    const calls = [];
    const response = () => new Response(JSON.stringify({ data: { user: { points: 0, download_protection_active: true } } }));
    const fetchProfile = loadFunction('../src/lib/points/ui.ts', 'fetchCurrentUserPointsProfile', {
        getClerkToken: async () => 'token',
        fetchUserPoints: async () => { calls.push('read'); return response(); },
        startDownloadProtection: async () => { calls.push('start'); return response(); },
    });
    await fetchProfile();
    const profile = await fetchProfile(true);
    assert.deepEqual(calls, ['read', 'start']);
    assert.equal(profile.points, 0);
    assert.equal(profile.downloadProtectionActive, true);
});

test('protected downloads skip cost confirmation and the extra metadata estimate', async () => {
    const confirm = loadFunction('../src/lib/api/saving-handler.ts', 'confirmPointsPreview', {
        estimatePointsForUrl: () => assert.fail('free download must not estimate again'),
        createDialog: () => assert.fail('no new-user notice or cost confirmation'),
    });
    assert.equal(await confirm('https://example.com/video', { points: 0, downloadProtectionActive: true }), true);
});

test('expired protection keeps normal cost confirmation without a first-download subsidy', async () => {
    let dialog;
    const confirm = loadFunction('../src/lib/api/saving-handler.ts', 'confirmPointsPreview', {
        isYouTubeDownloadPageRoute: () => false, isHomePageRoute: () => true,
        estimatePointsForUrl: async () => ({ points: 220, hasEstimate: true }),
        t: (key, args) => args ? `${key}:${args.required}` : key, get: value => value,
        createDialog: value => { dialog = value; value.buttons[1].action(); },
    });
    assert.equal(await confirm('https://example.com/video', { points: 20, downloadProtectionActive: false }), true);
    assert.equal(dialog.bodyText, 'dialog.points_preview.balance:220');
    assert.ok(!dialog.bodyText.includes('first_grace'));
});

for (const protectedDownload of [true, false]) {
    test(`batch zero-balance precheck: protection ${protectedDownload ? 'active' : 'expired'}`, async () => {
        const events = [];
        const download = loadFunction('../src/components/dialog/BatchDialog.svelte', 'downloadSelected', {
            running: false, pointsCheckLoading: false, selectedCountValue: 1,
            COLLECTION_SELECTION_LIMIT: 20, clerkEnabled: true, pointsPreviewReady: true,
            pointsPreviewLoading: false, $isSignedIn: true,
            items: [{ url: 'https://example.com/video' }], selected: [true], pointsPreviewRequired: 1000,
            fetchUserPointsProfile: async action => {
                assert.equal(action, true);
                events.push('activate');
                return { points: 0, membershipActive: false, downloadProtectionActive: protectedDownload };
            },
            showPointsInsufficient: () => events.push('insufficient'),
            showPointsError: () => assert.fail('unexpected error'),
            confirmBatchDownloadReadiness: async () => { events.push('readiness'); return null; },
        });
        await download();
        assert.deepEqual(events, protectedDownload ? ['activate', 'readiness'] : ['activate', 'insufficient']);
    });
}

test('homepage failed platform handoff still starts protection on the explicit download click', async () => {
    const events = [];
    const submit = loadFunction('../src/components/save/Omnibox.svelte', 'submit', {
        submitInFlight: false, $dialogs: [], isDisabled: false, isLoading: false, isDownloadable: true,
        downloadButtonState: { set() {} }, clerkEnabled: true,
        requireDownloadAuth: async () => true, rememberLinkForAuthReturn() {}, clearRememberedLink() {},
        fetchCurrentUserPointsProfile: async action => { assert.equal(action, true); events.push('activate'); return { points: 0 }; },
        detectedUrls: ['https://example.com/unsupported'], getDouyinGuideReason: () => 'browse',
        showDouyinGuideDialog: () => events.push('handoff'),
    });
    await submit();
    assert.deepEqual(events, ['activate', 'handoff']);
});
