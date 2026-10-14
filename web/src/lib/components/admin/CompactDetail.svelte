<script lang="ts">
    import { onDestroy, tick } from "svelte";

    export let text: string;
    export let summary = text;
    export let label = "Details";
    export let href = "";

    let trigger: HTMLButtonElement;
    let panel: HTMLDivElement;
    let opened = false;
    let left = 0;
    let top = 0;
    let copyStatus = "";
    let closeTimer: ReturnType<typeof setTimeout>;

    function keepOpen() {
        clearTimeout(closeTimer);
    }

    async function show() {
        keepOpen();
        opened = true;
        await tick();
        if (!opened || !panel) return;
        const rect = trigger.getBoundingClientRect();
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        top = rect.bottom + height + 8 <= window.innerHeight
            ? rect.bottom
            : Math.max(8, rect.top - height);
    }

    function close() {
        keepOpen();
        opened = false;
        copyStatus = "";
    }

    function leave(event: MouseEvent | FocusEvent) {
        const next = event.relatedTarget;
        if (next instanceof Node && (panel?.contains(next) || trigger?.contains(next))) return;
        keepOpen();
        closeTimer = setTimeout(close, 180);
    }

    function handleScroll(event: Event) {
        if (!(event.target instanceof Node) || !panel?.contains(event.target)) close();
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            copyStatus = "Copied";
        } catch {
            copyStatus = "Copy failed. Select the text to copy.";
        }
    }

    onDestroy(keepOpen);
</script>

<svelte:window on:resize={close} on:scroll|capture={handleScroll}
    on:keydown={(event) => event.key === "Escape" && close()} />

<button bind:this={trigger} type="button" class="summary" class:link={!!href}
    aria-label={`View full ${label}`} aria-expanded={opened}
    on:mouseenter={show} on:mouseleave={leave} on:focus={show} on:blur={leave}
    on:click={show}>
    {summary}
</button>

{#if opened}
    <div bind:this={panel} class="detail-panel" style:left={`${left}px`} style:top={`${top}px`}
        role="group" aria-label={label}
        on:mouseenter={keepOpen} on:mouseleave={leave}
        on:focusin={keepOpen} on:focusout={leave}>
        <div class="detail-card">
            <div class="detail-heading">
                <strong>{label}</strong>
                <button type="button" aria-label="Close details" on:click={close}>Close</button>
            </div>
            <div class="full-text">{text}</div>
            <div class="actions">
                <button type="button" on:click={copy}>Copy</button>
                {#if href}
                    <a {href} target="_blank" rel="noreferrer noopener">Open URL</a>
                {/if}
                <span role="status">{copyStatus}</span>
            </div>
        </div>
    </div>
{/if}

<style>
    .summary {
        display: block;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border: none;
        background: transparent;
        color: var(--text);
        padding: 0;
        text-align: left;
        font: inherit;
        cursor: pointer;
        user-select: text;
    }
    .link { text-decoration: underline; text-underline-offset: 3px; }
    .summary:hover { color: var(--accent-strong); }
    button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .detail-panel {
        position: fixed;
        z-index: 1000;
        width: min(440px, calc(100vw - 16px));
        padding: 4px 0;
        color: var(--text);
        text-transform: none;
        font-size: 0.85rem;
        white-space: normal;
    }
    .detail-card {
        padding: 12px;
        border: 1px solid var(--input-border);
        border-radius: 10px;
        background: var(--popup-bg);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
    }
    .detail-heading, .actions { display: flex; align-items: center; gap: 10px; }
    .detail-heading { justify-content: space-between; }
    .full-text {
        max-height: min(240px, 35vh);
        overflow: auto;
        margin: 10px 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        user-select: text;
        line-height: 1.5;
    }
    .actions { flex-wrap: wrap; }
    .detail-card button, .detail-card a {
        border: 1px solid var(--input-border);
        background: var(--button);
        color: var(--text);
        border-radius: 6px;
        padding: 5px 9px;
        font: inherit;
        cursor: pointer;
    }
    .detail-card button:hover, .detail-card a:hover { background: var(--button-hover); }
    .actions span { font-size: 0.78rem; }
</style>
