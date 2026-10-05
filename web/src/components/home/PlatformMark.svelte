<script lang="ts">
    export let name: string;
    export let logo: string | undefined = undefined;
    export let color: string | undefined = undefined;
    export let image: string | undefined = undefined;
</script>

<span class="mark" style:--brand={color || 'var(--accent)'} aria-hidden="true">
    {#if image}
        <img src={image} alt="" loading="lazy" width="28" height="28" />
    {:else if logo}
        <span class="brand" style:mask-image={`url('/platforms/${logo}.svg')`} style:-webkit-mask-image={`url('/platforms/${logo}.svg')`}></span>
    {:else}
        <span class="initial">{name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}</span>
    {/if}
</span>

<style>
    .mark { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 48px; height: 48px; border-radius: 14px; background: color-mix(in srgb, var(--brand) 8%, var(--button)); }
    .brand { width: 27px; height: 27px; background: var(--brand); mask-size: contain; mask-repeat: no-repeat; mask-position: center; -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; }
    .initial { font-size: 15px; font-weight: 700; color: var(--brand); }
    img { width: 28px; height: 28px; object-fit: contain; }
    @media (prefers-color-scheme: dark) { .brand { background: color-mix(in srgb, var(--brand) 65%, white); } }
</style>
