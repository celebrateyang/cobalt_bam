<script lang="ts">
    import { personalAgentDiscovery as agent } from '$lib/seo/agent-discovery';
</script>

<svelte:head>
    <title>AI agent access: REST and MCP - FreeSaveVideo</title>
    <meta name="description" content="FreeSaveVideo supports personal AI agents through REST and MCP. Discover services and pricing, get user authorization, check balances and resolve media." />
    <link rel="canonical" href={agent.documentationUrl} />
</svelte:head>

<main lang="en" class="agent-guide long-text-noto">
    <a href="/en">FreeSaveVideo</a>
    <h1>FreeSaveVideo supports personal AI agents</h1>
    <p>Use the REST API or MCP tools to discover supported media services, read a user's points balance and resolve a public media link. This guide is public and requires no login or JavaScript.</p>

    <section>
        <h2>Discover capabilities and prices</h2>
        <ul>
            <li><a href={agent.capabilitiesUrl}>Agent capabilities, current pricing rules and limits</a></li>
            <li><a href={agent.openApiUrl}>REST OpenAPI specification</a></li>
            <li><a href="/capabilities.json">Website capabilities and service map</a></li>
            <li><a href="/llms.txt">Short agent discovery summary</a> and <a href="/llms-full.txt">full site context</a></li>
        </ul>
        <p>Read the API's live capability response before starting a task. Website features such as batch downloads, video editing and payments are not all exposed as agent tools.</p>
    </section>

    <section>
        <h2>Ask the user to connect their account</h2>
        <p>The user creates a scoped credential on the <a href={agent.managementUrl}>agent authorization page</a> (<a href="/zh/account/agents">Chinese account page</a>). They choose permissions, expiry, daily calls, the points ceiling per resolution and whether membership quota can be used.</p>
        <p>Use <code>Authorization: Bearer &lt;user-created-credential&gt;</code>. The user can revoke access at any time. Never ask for their password or Clerk session. Public crawling does not authorize account access or spending.</p>
    </section>

    <section>
        <h2>Connect via MCP or REST</h2>
        <p>MCP endpoint: <code>{agent.mcpUrl}</code></p>
        <p>The endpoint uses stateless Streamable HTTP. Use a client that supports an Authorization header with a user-created credential. OAuth-only clients cannot connect using this credential flow; use REST if your agent can make authorized HTTP requests.</p>
        <p>Tools: <code>get_capabilities</code>, <code>get_balance</code>, <code>resolve_media</code>, <code>list_payment_products</code>, <code>create_checkout</code> and <code>get_checkout</code>. Only authorized account tools appear in the tool list.</p>
        <pre><code>{`GET /agent/v1/balance
Authorization: Bearer <user-created-credential>

POST /agent/v1/resolve
Authorization: Bearer <user-created-credential>
Content-Type: application/json

{"url":"https://www.tiktok.com/@example/video/123","idempotencyKey":"my_task_123456","videoQuality":"720"}`}</code></pre>
        <p>REST base: <code>https://api.freesavevideo.online</code>. Reuse the same idempotency key for an immediate retry of the same task. Replay follows the existing one-hour window; a retry after that window may charge again. Use a new key for a new task.</p>
    </section>

    <section>
        <h2>Spending and delivery</h2>
        <p>Successful resolution can spend the user's authorized points or count against an authorized membership quota. Default spending permission is zero points, with membership use disabled. There is no automatic recharge.</p>
        <p>The agent saves the file after resolution. Check whether the result is a redirect, tunnel, picker or local-processing result. Media links can expire. Do not report a file as saved until saving completes.</p>
        <p>For Direct Bridge services such as TikTok, use the returned direct media URL. If browser fetch is blocked by CORS, use the browser extension or a user browser handoff. Do not silently fall back to an API tunnel.</p>
    </section>
    <section>
        <h2>User-confirmed purchases</h2>
        <p>List products with <code>list_payment_products</code> (REST: <code>GET /agent/v1/products?kind=credits&amp;provider=wechat</code>). Purchase orders require separate <code>payments:create</code> and <code>payments:read</code> scopes, a currency, a per-order amount ceiling and a daily new-order amount ceiling. Amounts in API requests are minor units: CNY fen or USD cents. Defaults are zero; existing credentials have no purchase permission.</p>
        <p>Create an unpaid order with <code>create_checkout</code> (REST: <code>POST /agent/v1/checkouts</code>) using kind, provider, productKey and idempotencyKey. Reuse that key on every retry; order deduplication is durable and a different product conflicts. Present the returned confirmationUrl and amount to the user. The user signs in to the website, reviews the order, confirms it and completes payment.</p>
        <p>Query <code>get_checkout</code> (REST: <code>GET /agent/v1/checkouts/&lt;checkoutId&gt;</code>) at most once every 15 seconds. Continue only when <code>readyToContinue</code> is true, based on verified payment fulfillment. A browser return URL does not prove payment. Read balance and resume the original task with the same download permissions; buying membership does not authorize membership use. For a previously failed resolution, use a new task key after checking the failure outcome. Never rerun a completed download outside its one-hour replay window.</p>
    </section>
    <p>This interface does not imply registration or compatibility with every agent platform. Verify your client's transport and credential support.</p>
</main>

<style>
    .agent-guide { max-width: 850px; margin: 0 auto; padding: 2rem 1.25rem 4rem; color: var(--text); }
    h1 { margin: 1rem 0; } h2 { margin: 1.5rem 0 .5rem; }
    p, li { overflow-wrap: anywhere; } a { text-decoration: underline; }
    pre { padding: 1rem; border: 1px solid var(--input-border); border-radius: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
    code { user-select: text; -webkit-user-select: text; }
</style>
