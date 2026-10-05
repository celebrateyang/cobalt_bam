<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { currentApiURL } from '$lib/api/api-url';
    import { clerkEnabled, clerkLoaded, clerkUser, initClerk, getClerkToken, signIn } from '$lib/state/clerk';

    type Grant = { id: string; name: string; scopes: string[]; daily_calls: number; max_points_per_call: number;
        allow_membership: boolean; expires_at: string; revoked_at: string | null };
    type Call = { id: string; name: string; operation: string; source_host: string | null; started_at: string;
        outcome: string; error_code: string | null; points_charged: number };
    let grants: Grant[] = [], calls: Call[] = [];
    let name = '', expiresInDays = 7, dailyCalls = 10, maxPointsPerCall = 0;
    let allowResolve = true, allowMembership = false, consent = false;
    let token = '', busy = false, error = '', copied = false;
    let loadedUser = '', mounted = false, disposed = false;
    $: chinese = $page.params.lang === 'zh';
    $: copy = chinese ? ((en: string, zh: string) => zh) : ((en: string, zh: string) => en);
    $: endpoint = `${currentApiURL()}/agent/mcp`;
    const request = async (path: string, method = 'GET', body?: unknown) => {
        const expectedUser = $clerkUser?.id;
        const auth = await getClerkToken();
        if (!auth || expectedUser !== $clerkUser?.id || disposed) throw new Error(copy('Sign in to manage agent access.', '\u8bf7\u5148\u767b\u5f55\u518d\u7ba1\u7406 agent \u6388\u6743\u3002'));
        const response = await fetch(`${currentApiURL()}/agent${path}`, { method,
            headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.code || 'AGENT_UNAVAILABLE');
        return payload.data;
    };
    const refresh = async () => {
        const expectedUser = $clerkUser?.id;
        busy = true; error = '';
        try {
            const data = await Promise.all([request('/grants'), request('/calls')]);
            if (!disposed && expectedUser === $clerkUser?.id) [grants, calls] = data;
        }
        catch (err) { error = err instanceof Error ? err.message : 'AGENT_UNAVAILABLE'; }
        finally { busy = false; }
    };
    const create = async () => {
        if (!consent || busy) return;
        const expectedUser = $clerkUser?.id;
        busy = true; error = ''; token = ''; copied = false;
        try {
            const data = await request('/grants', 'POST', { name, expiresInDays, dailyCalls, maxPointsPerCall,
                allowMembership: allowResolve && allowMembership,
                scopes: allowResolve ? ['balance:read', 'media:resolve'] : ['balance:read'] });
            if (disposed || expectedUser !== $clerkUser?.id) return;
            token = data.token; consent = false;
            const lists = await Promise.all([request('/grants'), request('/calls')]);
            if (!disposed && expectedUser === $clerkUser?.id) [grants, calls] = lists;
        } catch (err) { error = err instanceof Error ? err.message : 'AGENT_UNAVAILABLE'; }
        finally { busy = false; }
    };
    const revoke = async (id: string) => {
        busy = true; error = '';
        try { await request(`/grants/${id}`, 'DELETE'); token = ''; await refresh(); }
        catch (err) { error = err instanceof Error ? err.message : 'AGENT_UNAVAILABLE'; }
        finally { busy = false; }
    };
    const copyToken = async () => {
        try { await navigator.clipboard.writeText(token); copied = true; }
        catch { error = copy('Select and copy the credential manually.', '\u8bf7\u624b\u52a8\u9009\u4e2d\u5e76\u590d\u5236\u51ed\u636e\u3002'); }
    };
    const formatDate = (value: string) => new Date(Number(value)).toLocaleString(chinese ? 'zh-CN' : 'en-US');
    $: if (mounted && $clerkLoaded && $clerkUser?.id && loadedUser !== $clerkUser.id) {
        loadedUser = $clerkUser.id; token = ''; grants = []; calls = []; void refresh();
    }
    $: if (mounted && !$clerkUser) { token = ''; grants = []; calls = []; loadedUser = ''; }
    onMount(() => { mounted = true; void initClerk(); });
    onDestroy(() => { disposed = true; token = ''; });
</script>

<svelte:head>
    <title>{copy('Personal agent access', '\u4e2a\u4eba agent \u6388\u6743')} - FreeSaveVideo</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="agent-page">
    <a href={`/${$page.params.lang}/account`}>{copy('Back to account', '\u8fd4\u56de\u8d26\u6237')}</a>
    <h1>{copy('Personal agent access', '\u4e2a\u4eba agent \u6388\u6743')}</h1>
    <p>{copy('Connect your agent to resolve media and check your points balance. You control its permissions and limits.', '\u8ba9\u4f60\u7684 agent \u89e3\u6790\u5a92\u4f53\u3001\u67e5\u8be2\u79ef\u5206\u4f59\u989d\u3002\u6743\u9650\u548c\u989d\u5ea6\u7531\u4f60\u63a7\u5236\u3002')}</p>
    <p><a href={`${currentApiURL()}/agent/v1/capabilities`} target="_blank" rel="noreferrer">{copy('Services and pricing', '\u670d\u52a1\u4e0e\u4ef7\u683c')}</a> &middot;
        <a href={`${currentApiURL()}/agent/openapi.json`} target="_blank" rel="noreferrer">OpenAPI</a></p>
    {#if !clerkEnabled}
        <p>{copy('Sign-in is not configured for this instance.', '\u5f53\u524d\u5b9e\u4f8b\u672a\u914d\u7f6e\u767b\u5f55\u3002')}</p>
    {:else if !$clerkLoaded}
        <p aria-live="polite">{copy('Loading...', '\u52a0\u8f7d\u4e2d...')}</p>
    {:else if !$clerkUser}
        <button on:click={() => signIn()}>{copy('Sign in', '\u767b\u5f55')}</button>
    {:else}
        {#if error}<p role="alert" class="error">{error}</p>{/if}
        <section>
            <h2>{copy('Create an authorization', '\u521b\u5efa\u6388\u6743')}</h2>
            <form on:submit|preventDefault={create}>
                <label>{copy('Agent name', 'Agent \u540d\u79f0')}<input required maxlength="80" bind:value={name} autocomplete="off" /></label>
                <div class="fields">
                    <label>{copy('Valid for (days)', '\u6709\u6548\u671f\uff08\u5929\uff09')}<input type="number" min="1" max="30" step="1" required bind:value={expiresInDays} /></label>
                    <label>{copy('Calls per day', '\u6bcf\u65e5\u8c03\u7528\u4e0a\u9650')}<input type="number" min="1" max="100" step="1" required bind:value={dailyCalls} /></label>
                    <label>{copy('Max points per resolution', '\u5355\u6b21\u89e3\u6790\u79ef\u5206\u4e0a\u9650')}<input type="number" min="0" max="1000" step="1" required bind:value={maxPointsPerCall} /></label>
                </div>
                <p>{copy('Balance read access is included. Daily limits reset at 00:00 UTC (08:00 China time), including failed calls and retries.', '\u5305\u542b\u4f59\u989d\u67e5\u8be2\u6743\u9650\u3002\u6bcf\u65e5\u9650\u989d\u5728 UTC 00:00\uff08\u5317\u4eac\u65f6\u95f4 08:00\uff09\u91cd\u7f6e\uff0c\u5931\u8d25\u8c03\u7528\u548c\u91cd\u8bd5\u4e5f\u8ba1\u5165\u6b21\u6570\u3002')}</p>
                <label class="checkbox"><input type="checkbox" bind:checked={allowResolve} />{copy('Allow media resolution', '\u5141\u8bb8\u5a92\u4f53\u89e3\u6790')}</label>
                <label class="checkbox"><input type="checkbox" bind:checked={allowMembership} disabled={!allowResolve} />{copy('Allow use of my membership download quota', '\u5141\u8bb8\u4f7f\u7528\u6211\u7684\u4f1a\u5458\u4e0b\u8f7d\u989d\u5ea6')}</label>
                <p>{copy('Successful resolution costs 2 points per started minute (2 when duration is unknown), or uses an authorized membership download. Saving is performed by your agent. No automatic recharge. With a 0-point limit and membership disabled, paid resolutions are rejected.', '\u89e3\u6790\u6210\u529f\u540e\uff0c\u6bcf\u5206\u949f\u6536\u53d6 2 \u79ef\u5206\uff0c\u4e0d\u8db3\u4e00\u5206\u949f\u5411\u4e0a\u53d6\u6574\uff08\u65f6\u957f\u672a\u77e5\u6536\u53d6 2 \u79ef\u5206\uff09\uff0c\u6216\u4f7f\u7528\u5df2\u6388\u6743\u7684\u4f1a\u5458\u4e0b\u8f7d\u989d\u5ea6\u3002\u4fdd\u5b58\u6587\u4ef6\u7531 agent \u5b8c\u6210\uff0c\u4e0d\u4f1a\u81ea\u52a8\u5145\u503c\u3002\u79ef\u5206\u4e0a\u9650\u4e3a 0 \u4e14\u672a\u5f00\u542f\u4f1a\u5458\u6743\u9650\u65f6\uff0c\u9700\u4ed8\u8d39\u7684\u89e3\u6790\u4f1a\u88ab\u62d2\u7edd\u3002')}</p>
                <label class="checkbox"><input type="checkbox" required bind:checked={consent} />{copy('I authorize these permissions and limits, including the stated point or membership usage.', '\u6211\u6388\u6743\u4ee5\u4e0a\u6743\u9650\u548c\u9650\u989d\uff0c\u5305\u62ec\u6240\u8bf4\u660e\u7684\u79ef\u5206\u6216\u4f1a\u5458\u989d\u5ea6\u4f7f\u7528\u3002')}</label>
                <button disabled={busy || !consent}>{copy('Create credential', '\u521b\u5efa\u51ed\u636e')}</button>
            </form>
            {#if token}
                <div class="credential" role="status">
                    <p>{copy('Shown once. Give this credential only to an agent you trust. It is not stored in this browser.', '\u51ed\u636e\u4ec5\u663e\u793a\u4e00\u6b21\u3002\u8bf7\u4ec5\u4ea4\u7ed9\u4f60\u4fe1\u4efb\u7684 agent\uff0c\u6d4f\u89c8\u5668\u4e0d\u4f1a\u5b58\u50a8\u5b83\u3002')}</p>
                    <label>{copy('Credential', '\u51ed\u636e')}<textarea readonly value={token} spellcheck="false" /></label>
                    <button type="button" on:click={copyToken}>{copied ? copy('Copied', '\u5df2\u590d\u5236') : copy('Copy credential', '\u590d\u5236\u51ed\u636e')}</button>
                    <button type="button" on:click={() => token = ''}>{copy('Hide', '\u9690\u85cf')}</button>
                </div>
            {/if}
            <p>MCP: <code>{endpoint}</code></p>
            <p>{copy('Configure the client with this URL and an Authorization: Bearer credential header. Use a client that supports custom headers. For other clients, use the REST API described in OpenAPI.', '\u5728\u652f\u6301\u81ea\u5b9a\u4e49\u8bf7\u6c42\u5934\u7684\u5ba2\u6237\u7aef\u4e2d\u914d\u7f6e\u6b64\u5730\u5740\u548c Authorization: Bearer \u51ed\u636e\u3002\u5176\u4ed6\u5ba2\u6237\u7aef\u53ef\u4f7f\u7528 OpenAPI \u63cf\u8ff0\u7684 REST \u63a5\u53e3\u3002')}</p>
        </section>
        <section>
            <h2>{copy('Authorizations', '\u6388\u6743\u5217\u8868')}</h2>
            <button type="button" on:click={refresh} disabled={busy}>{copy('Refresh', '\u5237\u65b0')}</button>
            {#each grants as grant (grant.id)}
                <article>
                    <strong>{grant.name}</strong><p>{grant.scopes.join(', ')}</p>
                    <p>{grant.daily_calls} {copy('calls/day', '\u6b21/\u5929')} &middot; {grant.max_points_per_call} {copy('points/call', '\u79ef\u5206/\u6b21')} &middot;
                        {copy('Membership', '\u4f1a\u5458\u989d\u5ea6')}: {grant.allow_membership ? copy('Allowed', '\u5141\u8bb8') : copy('Disabled', '\u7981\u7528')}</p>
                    <p>{copy('Expires', '\u5230\u671f')}: {formatDate(grant.expires_at)}</p>
                    {#if grant.revoked_at}<span>{copy('Revoked', '\u5df2\u64a4\u9500')}</span>
                    {:else if Number(grant.expires_at) <= Date.now()}<span>{copy('Expired', '\u5df2\u8fc7\u671f')}</span>
                    {:else}<button type="button" disabled={busy} on:click={() => revoke(grant.id)}>{copy('Revoke access', '\u64a4\u9500\u6388\u6743')}</button>{/if}
                </article>
            {:else}<p>{copy('No authorizations yet.', '\u6682\u65e0\u6388\u6743\u3002')}</p>{/each}
        </section>
        <section>
            <h2>{copy('Recent calls (latest 100)', '\u6700\u8fd1\u8c03\u7528\uff08\u6700\u8fd1 100 \u6761\uff09')}</h2>
            <p>{copy('Logs show the source host and result, without full media URLs or credentials.', '\u65e5\u5fd7\u8bb0\u5f55\u6765\u6e90\u57df\u540d\u548c\u7ed3\u679c\uff0c\u4e0d\u8bb0\u5f55\u5b8c\u6574\u5a92\u4f53\u5730\u5740\u6216\u51ed\u636e\u3002')}</p>
            {#each calls as call (call.id)}
                <article><strong>{call.name}</strong> &middot; <time>{formatDate(call.started_at)}</time>
                    <p>{call.operation} &middot; {call.source_host || '-'} &middot; {call.outcome} &middot; {call.points_charged} {copy('points', '\u79ef\u5206')}</p>
                    {#if call.error_code}<code>{call.error_code}</code>{/if}</article>
            {:else}<p>{copy('No calls yet.', '\u6682\u65e0\u8c03\u7528\u3002')}</p>{/each}
        </section>
    {/if}
</div>

<style>
    .agent-page { max-width: 850px; margin: 0 auto; padding: 2rem 1rem 5rem; }
    section { border: 1px solid var(--border-color, #8885); border-radius: 12px; padding: 1.25rem; margin-top: 1.5rem; }
    h1 { font-size: 1.8rem; } h2 { font-size: 1.25rem; margin: 0 0 1rem; }
    p { line-height: 1.6; overflow-wrap: anywhere; } label { display: flex; flex-direction: column; gap: .5rem; margin: .8rem 0; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; }
    .checkbox { flex-direction: row; align-items: start; } input[type=checkbox] { margin-top: .2rem; }
    input:not([type=checkbox]), textarea { width: 100%; padding: .65rem; box-sizing: border-box; border: 1px solid #8888; border-radius: 6px; background: transparent; color: inherit; }
    button { padding: .6rem .9rem; margin: .25rem .4rem .25rem 0; border: 1px solid #8888; border-radius: 6px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; } article { border-top: 1px solid #8885; padding: 1rem 0; }
    article p { margin: .4rem 0; } .credential { padding: 1rem; margin: 1rem 0; border: 1px solid #8888; border-radius: 8px; }
    textarea { min-height: 70px; font-family: monospace; } .error { color: #d33; } code { overflow-wrap: anywhere; }
</style>
