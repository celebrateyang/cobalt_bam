<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SupportLink from "$components/save/SupportLink.svelte";
    import IconGift from "@tabler/icons-svelte/IconGift.svelte";
    import IconUsers from "@tabler/icons-svelte/IconUsers.svelte";
    import IconSpeakerphone from "@tabler/icons-svelte/IconSpeakerphone.svelte";
    import { clerkUser, getClerkToken, signIn } from "$lib/state/clerk";
    import { currentApiURL } from "$lib/api/api-url";

    export let data: { lang: string };
    $: lang = data.lang;
    $: contacts = lang === "zh" ? ["wechat"] : ["line", "whatsapp"];
    let xOpened = false;
    let xLoading = false;
    let xMessage = "";
    let xUsername = "";
    let xFile: File | null = null;
    $: zh = lang === "zh";
    async function claimXReward() {
        if (!$clerkUser) { await signIn(); return; }
        if (xLoading) return;
        if (!/^[a-zA-Z0-9_]{1,15}$/.test(xUsername.replace(/^@/, "").trim()) || !xFile || xFile.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(xFile.type)) {
            xMessage = zh ? "请输入有效的 X 用户名，并选择不超过 2 MB 的 PNG、JPEG 或 WebP 截图。" : "Enter a valid X username and select a PNG, JPEG or WebP screenshot up to 2 MB.";
            return;
        }
        xLoading = true;
        xMessage = "";
        try {
            const token = await getClerkToken();
            if (!token) throw new Error("No session");
            const response = await fetch(`${currentApiURL()}/user/x-follow-submissions`, {
                method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": xFile.type, "X-Follow-Username": xUsername.replace(/^@/, "").trim() }, body: xFile,
            });
            const result = await response.json();
            if (response.status === 409) {
                xMessage = zh ? "已有待审核申请，或该网站账号 / X 账号已领取奖励。" : "An application is pending, or this website or X account has already received the reward.";
                return;
            }
            if (!response.ok || result.status !== "success") throw new Error("Claim failed");
            xMessage = zh ? "申请已提交，审核通过后将发放 100 积分。可在账户记录中查看进度。" : "Application submitted. You will receive 100 points after approval. Check your account records for status.";
            xUsername = ""; xFile = null;
        } catch {
            xMessage = zh ? "提交失败，请重试。" : "Could not submit the application. Please try again.";
        } finally { xLoading = false; }
    }
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
        <section aria-labelledby="x-follow-title">
            <h2 id="x-follow-title"><IconGift size={23} /> {zh ? "关注 X 账号领取 100 积分" : "Follow us on X for 100 points"}</h2>
            <p>{zh ? "关注 @celebrate74730，提交你的 X 用户名和能显示账号及已关注状态的截图。审核通过后发放 100 积分，每个网站账号和 X 账号限领一次。" : "Follow @celebrate74730, then submit your X username and a screenshot showing your account and follow status. After review, earn 100 points once per website and X account."}</p>
            <a class="action" href="https://x.com/celebrate74730" target="_blank" rel="noopener noreferrer" on:click={() => xOpened = true}>{zh ? "前往 X 关注" : "Follow on X"} <span aria-hidden="true">&#8599;</span></a>
            {#if xOpened}
                <div class="x-form">
                    <label for="x-username">{zh ? "你的 X 用户名" : "Your X username"}</label>
                    <input id="x-username" bind:value={xUsername} maxlength="16" placeholder="@username" />
                    <label for="x-proof">{zh ? "关注截图（最大 2 MB）" : "Follow screenshot (max 2 MB)"}</label>
                    <input id="x-proof" type="file" accept="image/png,image/jpeg,image/webp" on:change={(event) => xFile = event.currentTarget.files?.[0] || null} />
                    <button class="action" disabled={xLoading} on:click={claimXReward}>{$clerkUser ? (xLoading ? (zh ? "提交中..." : "Submitting...") : (zh ? "提交审核" : "Submit for review")) : (zh ? "登录后提交" : "Sign in to submit")}</button>
                    <a href={`/${lang}/account`}>{zh ? "查看账户记录" : "View account records"}</a>
                </div>
            {/if}
            <p aria-live="polite">{xMessage}</p>
        </section>
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
    button.action { border: 0; color: var(--accent-strong); cursor: pointer; margin-left: 8px; }
    .x-form { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 16px; }
    .x-form input { max-width: 100%; }
    footer > a, footer :global(a) { display: inline-block; margin: 0 20px 10px 0; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    @media (max-width: 600px) { .free-points { padding: 20px 16px 100px; } section { padding: 20px 16px; } h2 { font-size: 19px; } }
</style>
