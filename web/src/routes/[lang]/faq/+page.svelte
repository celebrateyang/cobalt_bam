<script lang="ts">
    import { t } from '$lib/i18n/translations';

    const itemKeys = ['usage', 'platforms', 'free', 'contact'] as const;

    $: title = $t('faq.title');
    $: description = $t('faq.description');
</script>

<svelte:head>
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
</svelte:head>

<main id="faq">
    <h1>{title}</h1>
    <p class="lede">{description}</p>

    <div class="faq-list">
        {#each itemKeys as key, index}
            <section class="faq-item">
                <div class="question">
                    <span class="number">{(index + 1).toString().padStart(2, '0')}</span>
                    <h2>{$t(`faq.items.${key}.q`)}</h2>
                </div>
                <p class="answer">{$t(`faq.items.${key}.a`)}</p>
            </section>
        {/each}
    </div>
</main>

<style>
    #faq {
        padding: calc(var(--padding) * 2) var(--padding);
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    h1 {
        margin: 0;
        color: var(--secondary);
        font-size: clamp(22px, 3vw, 28px);
    }

    .lede {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.6;
    }

    .faq-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 10px;
    }

    .faq-item {
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
    }

    .question {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
    }

    .number {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--surface-3);
        color: var(--secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-family: "IBM Plex Mono", monospace;
    }

    h2 {
        margin: 0;
        font-size: 17px;
        color: var(--secondary);
    }

    .answer {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.6;
    }

    @media (max-width: 600px) {
        #faq {
            padding: calc(var(--padding) * 1.5) var(--padding);
        }

        .faq-item {
            padding: 12px;
        }
    }
</style>
