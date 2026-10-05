<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SupportLink from "$components/save/SupportLink.svelte";
    import IconGift from "@tabler/icons-svelte/IconGift.svelte";
    import IconUsers from "@tabler/icons-svelte/IconUsers.svelte";
    import IconSpeakerphone from "@tabler/icons-svelte/IconSpeakerphone.svelte";

    export let data: { lang: string };
    $: lang = data.lang;
    $: contacts = lang === "zh" ? ["wechat"] : ["line", "whatsapp"];
</script>

<svelte:head>
    <title>{$t("home.welcome.points_title")} - FreeSaveVideo</title>
    <meta name="description" content={$t("home.welcome.points_summary")} />
</svelte:head>

<main class="free-points">
    <header>
        <a href={`/${lang}/`}>FreeSaveVideo <span aria-hidden="true">&larr;</span></a>
        <h1>{$t("home.welcome.points_title")}</h1>
        <p>{$t("home.welcome.points_summary")}</p>
    </header>
    <section aria-labelledby="chat-title">
        <h2 id="chat-title"><IconGift size={23} /> {$t("auth.contact_points_title")}</h2>
        <p>{$t("auth.contact_points_subtitle")}</p>
        <div class="contacts">
            {#each contacts as contact}
                <figure>
                    <img src={`/account/${contact}.png`} width="180" height="180" alt={$t(`auth.contact_points_${contact}_alt`)} />
                    <figcaption>{$t(`auth.contact_points_${contact}`)}</figcaption>
                </figure>
            {/each}
        </div>
        <p class="note">{$t("auth.contact_points_note")}</p>
        <a class="action" href={`/${lang}/account?section=contact`}>{$t("auth.title")} <span aria-hidden="true">&rarr;</span></a>
    </section>
    <section aria-labelledby="invite-title">
        <h2 id="invite-title"><IconUsers size={23} /> {$t("auth.referral_title")}</h2>
        <p>{$t("auth.referral_subtitle")}</p>
        <ol>
            <li>{$t("auth.referral_rule_1")}</li>
            <li>{$t("auth.referral_rule_2")}</li>
            <li>{$t("auth.referral_rule_3")}</li>
        </ol>
        <a class="action" href={`/${lang}/account?section=referral`}>{$t("auth.referral_link_label")} <span aria-hidden="true">&rarr;</span></a>
    </section>
    <section aria-labelledby="promotion-title">
        <h2 id="promotion-title"><IconSpeakerphone size={23} /> {$t("home.welcome.promotion_title")}</h2>
        <ul>
            <li>{$t("home.welcome.promotion_post")}</li>
            <li>{$t("home.welcome.promotion_video")}</li>
        </ul>
        <p>{$t("home.welcome.promotion_review")}</p>
        <a class="action" href={`/${lang}/account?section=promotion`}>{$t("home.welcome.details")} <span aria-hidden="true">&rarr;</span></a>
    </section>
    <footer>
        <p>{$t("home.welcome.paid_note")}</p>
        <SupportLink />
        <a href={`/${lang}/about/contact`}>{$t("about.page.contact")}</a>
    </footer>
</main>

<style>
    .free-points, .free-points :global(*) { font-family: Arial, sans-serif; }
    .free-points { width: min(860px, 100%); margin: 0 auto; padding: 32px 24px 48px; box-sizing: border-box; color: var(--text); }
    header { margin-bottom: 28px; }
    h1 { margin: 22px 0 12px; font-size: clamp(27px, 4vw, 36px); }
    p, li { color: var(--subtext); line-height: 1.7; font-size: 15px; }
    h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 21px; }
    h2 :global(svg) { color: var(--accent-strong); flex-shrink: 0; }
    section { border: 1px solid var(--popup-stroke); border-radius: 16px; padding: 24px; margin-bottom: 20px; background: var(--background); }
    a, footer :global(a) { color: var(--accent-strong); text-underline-offset: 3px; }
    .contacts { display: flex; flex-wrap: wrap; gap: 24px; margin: 20px 0; }
    figure { margin: 0; padding: 16px; border-radius: 12px; background: white; border: 1px solid #e5e7eb; text-align: center; }
    img { display: block; object-fit: contain; }
    figcaption { margin-top: 10px; color: #282828; font-size: 14px; }
    .note { padding: 12px 16px; border-radius: 10px; background: var(--accent-background); color: var(--text); }
    li { margin-bottom: 8px; }
    .action { display: inline-flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 16px; border-radius: 9px; background: var(--accent-background); text-decoration: none; font-size: 14px; font-weight: 600; }
    footer > a, footer :global(a) { display: inline-block; margin: 0 20px 10px 0; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    @media (max-width: 600px) { .free-points { padding: 20px 16px 100px; } section { padding: 20px 16px; } h2 { font-size: 19px; } }
</style>
