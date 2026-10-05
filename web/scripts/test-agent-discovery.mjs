import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { compile, preprocess } from 'svelte/compiler';
import * as internal from 'svelte/internal';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root,path),'utf8');
const modules = new Map();
const evaluate = (code, file) => {
    const exports = {};
    const require = name => {
        if (name === 'svelte/internal') return internal;
        if (name === '@sveltejs/kit') return { redirect: (status,location) => { throw { status,location }; } };
        if (name === '$lib/seo/language-routing') return {
            getPreferredLanguage: () => 'zh', getRequestCountry: () => 'CN',
            isLangPrefixedPath: path => /^\/(en|zh)(\/|$)/.test(path),
        };
        if (name === '$lib/seo/indexing') return {
            getLegacyRedirectTarget: () => null,
            getLocalizedRoute: path => /^\/(en|zh)(\/|$)/.test(path) ? {lang:path.split('/')[1],path:'/'} : null,
            shouldNoindexLocalizedPath: () => false,
        };
        if (name.startsWith('$lib/')) return load(resolve(root,'src/lib',name.slice(5))+'.ts');
        if (name.startsWith('.')) return load(resolve(dirname(file),name)+'.ts');
        throw new Error(`Unexpected import ${name}`);
    };
    new Function('require','exports',code)(require,exports);
    return exports;
};
const load = file => {
    if (!modules.has(file)) modules.set(file,evaluate(ts.transpileModule(readFileSync(file,'utf8'),{
        compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText,file));
    return modules.get(file);
};
const render = async path => {
    const source = await preprocess(read(path),{script:({content,attributes}) => attributes.lang === 'ts'
        ? {code:ts.transpileModule(content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText} : undefined});
    const compiled = compile(source.code,{generate:'ssr',filename:resolve(root,path)});
    return evaluate(ts.transpileModule(compiled.js.code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,resolve(root,path)).default.render();
};

test('server-rendered HTML declares support and links agent discovery without JavaScript',async () => {
    const layout = await render('src/routes/+layout.svelte');
    assert.match(layout.head,/name="fsv-agent-access"[^>]+Supported: REST and MCP/);
    assert.match(layout.head,/href="\/agents"/);
    assert.match(layout.head,/href="\/llms.txt"/);
    assert.match(layout.head,/href="\/capabilities.json"/);
    assert.match(layout.head,/https:\/\/api\.freesavevideo\.online\/agent\/openapi.json/);
    const guide = await render('src/routes/agents/+page.svelte');
    assert.match(guide.html,/FreeSaveVideo supports personal AI agents/);
    assert.match(guide.html,/get_balance/);assert.match(guide.html,/resolve_media/);
    assert.match(guide.html,/Authorization: Bearer/);
    assert.match(guide.html,/There is no automatic recharge/);
    assert.match(guide.html,/agent\/v1\/capabilities/);
    assert.match(guide.head,/rel="canonical" href="https:\/\/freesavevideo.online\/agents"/);
});

test('guide avoids language redirect and HTML responses preserve existing Link headers',async () => {
    const {handle} = load(resolve(root,'src/hooks.server.ts'));
    const result = await handle({event:{url:new URL('https://freesavevideo.online/agents'),request:new Request('https://freesavevideo.online/agents')},
        resolve:async () => new Response('guide',{headers:{'Content-Type':'text/html; charset=utf-8',Link:'</existing>; rel="preload"'}})});
    assert.equal(result.status,200);
    assert.match(result.headers.get('Link'),/existing.*\/agents.*\/llms.txt.*\/capabilities.json/);
    const json = await handle({event:{url:new URL('https://freesavevideo.online/capabilities.json'),request:new Request('https://freesavevideo.online/capabilities.json')},
        resolve:async () => new Response('{}',{headers:{'Content-Type':'application/json'}})});
    assert.equal(json.headers.has('Link'),false);
});

test('discovery summary and JSON flag agree, while account pages stay disallowed',() => {
    const { personalAgentDiscovery } = load(resolve(root,'src/lib/seo/agent-discovery.ts'));
    assert.equal(personalAgentDiscovery.supported,true);
    const summary = read('static/llms.txt');
    for (const key of ['documentationUrl','capabilitiesUrl','openApiUrl','mcpUrl','managementUrl']) assert.ok(summary.includes(personalAgentDiscovery[key]));
    const robots = read('static/robots.txt');
    assert.match(robots,/https:\/\/freesavevideo.online\/agents/);
    assert.ok(robots.includes('Disallow: /*/account/'));
    assert.ok(read('src/routes/[lang]/+page.svelte').includes('href="/agents"'));
    assert.ok(read('src/routes/sitemap.xml/+server.ts').includes('`${site}/agents`'));
    const {agentDiscoveryLinkHeader} = load(resolve(root,'src/lib/seo/agent-discovery.ts'));
    assert.ok(read('static/_headers').includes(`Link: ${agentDiscoveryLinkHeader}`));
});
