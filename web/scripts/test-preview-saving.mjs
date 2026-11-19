import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';
import { test } from 'node:test';
import ts from 'typescript';

function dialog({ ios = true, outcome = 'shared', directDownload = true } = {}) {
    let source = readFileSync(new URL('../src/components/dialog/PreviewDownloadDialog.svelte', import.meta.url), 'utf8')
        .split('<script lang="ts">')[1].split('</script>')[0].replace(/export let /g, 'let ');
    const ast = ts.createSourceFile('dialog.ts', source, ts.ScriptTarget.Latest, true);
    for (const node of [...ast.statements].reverse()) {
        if (ts.isImportDeclaration(node) || ts.isLabeledStatement(node)) {
            source = source.slice(0, node.pos) + source.slice(node.end);
        }
    }
    source += '\nexports.api = { completeDownload, downloadFromUrl, save, state: () => ({ file, saveStarted, statusText, saving }) };';
    const exports = {}, downloads = [], saves = [];
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
        exports, File, Blob, TextDecoder, Uint8Array, AbortController,
        URL: { createObjectURL: () => 'blob:video', revokeObjectURL() {} },
        device: { is: { iOS: ios }, supports: { directDownload, share: true } }, get: value => value, t: key => key,
        openFile: file => downloads.push(file),
        saveWithFeedback: async (method, { file }) => { saves.push({ method, file }); return outcome; },
        fetch: async () => new Response(new Uint8Array(2048), { headers: { 'content-type': 'application/octet-stream' } }),
        onMount() {}, onDestroy() {},
    });
    return { ...exports.api, downloads, saves };
}

test('iOS waits for a fresh tap and shares the actual ready file', async () => {
    const d = dialog();
    const file = new File([new Uint8Array(2048)], 'douyin.mp4', { type: 'video/mp4' });
    d.completeDownload(file);
    assert.equal(d.downloads.length, 0);
    assert.equal(d.state().saveStarted, false);
    await d.save('share');
    assert.equal(d.saves[0].method, 'share');
    assert.equal(d.saves[0].file, file);
    assert.equal(d.state().statusText, 'save.result.shared');
});

test('cancelled and failed saves keep the file for retry without claiming it was saved', async () => {
    for (const outcome of ['cancelled', 'failed']) {
        const d = dialog({ outcome });
        const file = new File(['video'], 'douyin.mp4');
        d.completeDownload(file);
        await d.save('share');
        assert.equal(d.state().saveStarted, false);
        assert.equal(d.state().statusText, `save.result.${outcome}`);
        assert.equal(d.state().file, file);
        await d.save();
        assert.equal(d.saves[1].method, 'download');
    }
});

test('desktop keeps automatic download and generic video MIME becomes playable MP4', async () => {
    const d = dialog({ ios: false });
    await d.downloadFromUrl('https://cdn.example/video', new AbortController().signal);
    assert.equal(d.downloads.length, 1);
    assert.equal(d.downloads[0].type, 'video/mp4');
});

test('preview dialog installed iOS uses native sharing for the ready file', async () => {
    const d = dialog({ directDownload: false });
    d.completeDownload(new File(['video'], 'douyin.mp4', { type: 'video/mp4' }));
    await d.save();
    assert.equal(d.downloads.length, 0);
    assert.equal(d.saves[0].method, 'share');
});

function savingDialog({ ios = true, directDownload = true, outcome = 'shared' } = {}) {
    let source = readFileSync(new URL('../src/components/dialog/SavingDialog.svelte', import.meta.url), 'utf8')
        .split('<script lang="ts">')[1].split('</script>')[0].replace(/export let /g, 'let ');
    const ast = ts.createSourceFile('saving.ts', source, ts.ScriptTarget.Latest, true);
    for (const node of [...ast.statements].reverse()) {
        if (ts.isImportDeclaration(node)) source = source.slice(0, node.pos) + source.slice(node.end);
    }
    source += '\nexports.api = { save, setFile: value => {file = value;}, state: () => ({outcome, saving}) };';
    const exports = {}, calls = [];
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
        exports, device: { is: { iOS: ios }, supports: { directDownload, share: true } },
        onDestroy() {}, saveWithFeedback: async (method, params) => { calls.push({ method, ...params }); return outcome; },
    });
    return { ...exports.api, calls };
}

test('shared saving dialog offers file sharing in Safari and preserves queue identity on repeat', async () => {
    const d = savingDialog();
    const file = new File(['media'], 'youtube.mp4', { type: 'video/mp4' });
    d.setFile(file);
    await d.save('share');
    assert.equal(d.calls[0].method, 'share');
    assert.equal(d.calls[0].file, file);
    assert.equal(d.calls[0].saveContext.repeat, undefined);
    await d.save();
    assert.equal(d.calls[1].method, 'download');
    assert.equal(d.calls[1].saveContext.repeat, true);
});

test('installed iOS uses its native sheet and desktop retains download', async () => {
    for (const [ios, directDownload, expected] of [[true, false, 'share'], [false, true, 'download']]) {
        const d = savingDialog({ ios, directDownload });
        d.setFile(new File(['media'], 'video.mp4'));
        await d.save();
        assert.equal(d.calls[0].method, expected);
    }
});

test('shared dialog cancellation keeps the file available for another action', async () => {
    const d = savingDialog({ outcome: 'cancelled' });
    d.setFile(new File(['media'], 'vimeo.mp4'));
    await d.save('share');
    assert.equal(d.state().outcome, 'cancelled');
    assert.equal(d.state().saving, false);
    await d.save();
    assert.equal(d.calls[1].method, 'download');
});
