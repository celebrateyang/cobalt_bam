import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const code = ts.transpileModule(readFileSync(new URL('../src/lib/api/reddit-photo-handoff.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const exports={}; vm.runInNewContext(code,{exports,URL});
const {redditPhotoHandoff,safeRedditPostUrl}=exports;
const post='https://www.reddit.com/r/pics/comments/abc123/example';
const error=code=>({status:'error',error:{code}});

test('known gallery can open extension instructions before any API or points call',()=>{
    assert.equal(redditPhotoHandoff('https://www.reddit.com/gallery/abc123'),'confirmed');
    assert.equal(redditPhotoHandoff(post),null);
    const handler=readFileSync(new URL('../src/lib/api/saving-handler.ts',import.meta.url),'utf8');
    assert.ok(handler.indexOf("redditPhotoHandoff(selectedRequest.url) === 'confirmed'")<handler.indexOf('const signedIn = await requireDownloadAuth()'));
});
test('explicit image response and blocked unknown post have different wording',()=>{
    assert.equal(redditPhotoHandoff(post,error('error.api.reddit.browser_required')),'confirmed');
    assert.equal(redditPhotoHandoff(post,error('error.api.fetch.fail')),'possible');
    assert.equal(redditPhotoHandoff('https://www.reddit.com/r/pics/s/ShareID',error('error.api.fetch.short_link')),'possible');
});
test('successful video and business/auth errors retain existing flows',()=>{
    for(const status of ['tunnel','redirect','local-processing','picker']) assert.equal(redditPhotoHandoff(post,{status}),null);
    for(const code of ['error.api.points.insufficient','error.api.auth.clerk.missing','error.api.content.video.unavailable']) assert.equal(redditPhotoHandoff(post,error(code)),null);
    assert.equal(redditPhotoHandoff('https://www.youtube.com/watch?v=abc',error('error.api.fetch.fail')),null);
});
test('handoff refuses off-domain, credential-bearing and script URLs',()=>{
    for(const url of ['javascript:alert(1)','https://reddit.com.evil.test/gallery/abc','https://user:password@reddit.com/gallery/abc','https://reddit.com:444/gallery/abc']) assert.equal(safeRedditPostUrl(url),null);
});
test('dialog uses the configured store link component and safely renders original error',()=>{
    const dialog=readFileSync(new URL('../src/components/dialog/RedditPhotosDialog.svelte',import.meta.url),'utf8');
    assert.ok(dialog.includes('ExtensionInstallPrompt'));
    assert.ok(dialog.includes('onInstall={openFreeSaveVideoExtensionStore}'));
    assert.ok(dialog.includes('{errorText}'));
    assert.equal(dialog.includes('{@html'),false);
    const prompt=readFileSync(new URL('../src/components/dialog/ExtensionInstallPrompt.svelte',import.meta.url),'utf8');
    assert.ok(prompt.includes('href={FREESAVEVIDEO_EXTENSION_STORE_URL}'));
});
