<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SupportLink from "$components/save/SupportLink.svelte";
    import IconGift from "@tabler/icons-svelte/IconGift.svelte";
    import IconUsers from "@tabler/icons-svelte/IconUsers.svelte";
    import IconSpeakerphone from "@tabler/icons-svelte/IconSpeakerphone.svelte";
    import { browser } from "$app/environment";
    import { onDestroy } from "svelte";
    import { clerkUser, getClerkToken, signIn } from "$lib/state/clerk";
    import { currentApiURL } from "$lib/api/api-url";

    export let data: { lang: string };
    $: lang = data.lang;
    $: contacts = lang === "zh" ? ["wechat"] : ["line", "whatsapp"];
    let xLoading = false;
    let xMessage = "";
    let xUsername = "";
    let xFile: File | null = null;
    let xPreview = "";
    let xStatus: "idle" | "loading" | "uploading" | "pending" | "approved" | "rejected" | "error" = "idle";
    let xStatusUserId = "";
    let xRequestVersion = 0;
    $: zh = lang === "zh";
    $: if (browser && ($clerkUser?.id || "") !== xStatusUserId) {
        xStatusUserId = $clerkUser?.id || "";
        xMessage = "";
        if (xStatusUserId) void loadXStatus(xStatusUserId);
        else { xRequestVersion++; xStatus = "idle"; }
    }

    async function loadXStatus(userId: string) {
        const version = ++xRequestVersion;
        xStatus = "loading";
        try {
            const token = await getClerkToken();
            if (!token) throw new Error("No session");
            let page = 1;
            let rejected = false;
            while (true) {
                const response = await fetch(`${currentApiURL()}/user/promotion-submissions/my?page=${page}&limit=100`, { headers: { Authorization: `Bearer ${token}` } });
                const result = await response.json();
                if (!response.ok || result.status !== "success") throw new Error("Status unavailable");
                if (version !== xRequestVersion || $clerkUser?.id !== userId) return;
                const records = Array.isArray(result.data?.submissions) ? result.data.submissions : [];
                const reward = records.find((item: { promotion_type: string; status: string }) => item.promotion_type === "x_follow" && ["PENDING", "APPROVED", "UPLOADING"].includes(item.status));
                if (reward) { xStatus = reward.status === "APPROVED" ? "approved" : reward.status === "UPLOADING" ? "uploading" : "pending"; return; }
                rejected ||= records.some((item: { promotion_type: string; status: string }) => item.promotion_type === "x_follow" && item.status === "REJECTED");
                if (page >= Number(result.data?.pagination?.pages || 0) || records.length === 0) break;
                page++;
            }
            xStatus = rejected ? "rejected" : "idle";
        } catch {
            if (version === xRequestVersion && $clerkUser?.id === userId) xStatus = "error";
        }
    }

    function selectXFile(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0] || null;
        if (xPreview) URL.revokeObjectURL(xPreview);
        xPreview = "";
        xFile = null;
        xMessage = "";
        if (!file) return;
        if (file.size === 0 || file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            xMessage = zh ? "请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。" : "Choose a PNG, JPEG or WebP image up to 2 MB.";
            input.value = "";
            return;
        }
        xFile = file;
        xPreview = URL.createObjectURL(file);
    }
    onDestroy(() => { xRequestVersion++; if (xPreview) URL.revokeObjectURL(xPreview); });

    async function claimXReward() {
        if (!$clerkUser) { await signIn(); return; }
        if (xLoading || xStatus === "loading" || xStatus === "uploading" || xStatus === "pending" || xStatus === "approved") return;
        if (!/^[a-zA-Z0-9_]{1,15}$/.test(xUsername.replace(/^@/, "").trim()) || !xFile || xFile.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(xFile.type)) {
            xMessage = zh ? "请输入有效的 X 用户名，并选择不超过 2 MB 的 PNG、JPEG 或 WebP 截图。" : "Enter a valid X username and select a PNG, JPEG or WebP screenshot up to 2 MB.";
            return;
        }
        xLoading = true;
        xMessage = "";
        const userId = $clerkUser.id;
        try {
            const token = await getClerkToken();
            if (!token) throw new Error("No session");
            const response = await fetch(`${currentApiURL()}/user/x-follow-submissions`, {
                method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": xFile.type, "X-Follow-Username": xUsername.replace(/^@/, "").trim() }, body: xFile,
            });
            const result = await response.json();
            if ($clerkUser?.id !== userId) return;
            if (response.status === 409) {
                xMessage = zh ? "已有待审核申请，或该网站账号 / X 账号已领取奖励。" : "An application is pending, or this website or X account has already received the reward.";
                void loadXStatus(userId);
                return;
            }
            if (!response.ok || result.status !== "success") throw new Error("Claim failed");
            xRequestVersion++;
            xStatus = "pending";
            xMessage = "";
            xUsername = ""; xFile = null;
            if (xPreview) URL.revokeObjectURL(xPreview);
            xPreview = "";
        } catch {
            if ($clerkUser?.id === userId) xMessage = zh ? "提交失败，请检查网络后重试；也可先查看账户记录确认是否已提交。" : "Could not submit. Check your connection and try again, or check your account records first.";
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
            {#if xStatus === "uploading" || xStatus === "pending" || xStatus === "approved"}
                <div class="x-status" role="status">
                    <span class="x-status-icon" aria-hidden="true">✓</span>
                    <div>
                        <strong>{xStatus === "uploading" ? (zh ? "截图正在处理" : "Screenshot upload is being processed") : xStatus === "pending" ? (zh ? "申请已提交，正在审核" : "Application submitted — under review") : (zh ? "审核已通过" : "Application approved")}</strong>
                        <p>{xStatus === "uploading" ? (zh ? "请稍后刷新页面查看状态。" : "Please refresh this page later to check the status.") : xStatus === "pending" ? (zh ? "截图已收到，审核通过后将发放 100 积分。" : "Your screenshot was received. You will receive 100 points after approval.") : (zh ? "100 积分奖励已发放。" : "Your 100-point reward has been awarded.")}</p>
                        <a href={`/${lang}/account`}>{zh ? "查看账户记录" : "View account records"} →</a>
                    </div>
                </div>
                <button class="action x-submit" disabled>{xStatus === "uploading" ? (zh ? "正在处理" : "Processing") : xStatus === "pending" ? (zh ? "已提交审核" : "Submitted for review") : (zh ? "已领取" : "Reward claimed")}</button>
            {:else}
                <a class="action" href="https://x.com/celebrate74730" target="_blank" rel="noopener noreferrer">{zh ? "前往 X 关注" : "Follow on X"} <span aria-hidden="true">&#8599;</span></a>
                {#if xStatus === "rejected"}
                    <p class="x-hint">{zh ? "上次申请未通过，你可以查看账户记录并重新提交。" : "Your previous application was not approved. Check your account records and submit again."} <a href={`/${lang}/account`}>{zh ? "查看记录" : "View records"}</a></p>
                {:else if xStatus === "error"}
                    <p class="x-hint">{zh ? "暂时无法加载申请状态，请查看账户记录或重试。" : "Could not load your application status. Check your account records or retry."} <button class="x-retry" on:click={() => $clerkUser && loadXStatus($clerkUser.id)}>{zh ? "重试" : "Retry"}</button></p>
                {/if}
                <div class="x-form">
                    <label for="x-username">{zh ? "你的 X 用户名" : "Your X username"}</label>
                    <input class="x-username" id="x-username" bind:value={xUsername} maxlength="16" placeholder="@username" autocomplete="off" />
                    <label for="x-proof">{zh ? "关注截图（最大 2 MB）" : "Follow screenshot (max 2 MB)"}</label>
                    <input id="x-proof" type="file" accept="image/png,image/jpeg,image/webp" on:change={selectXFile} />
                    {#if xFile && xPreview}
                        <div class="x-preview">
                            <img src={xPreview} alt={zh ? "选择的关注截图预览" : "Selected follow screenshot preview"} />
                            <div><strong>{zh ? "截图已选择" : "Screenshot selected"}</strong><span>{xFile.name}</span><small>{zh ? "提交审核后才会上传。" : "It will be uploaded when you submit."}</small></div>
                        </div>
                    {/if}
                    <button class="action x-submit" disabled={xLoading || xStatus === "loading"} on:click={claimXReward}>{$clerkUser ? (xLoading ? (zh ? "正在提交..." : "Submitting...") : xStatus === "loading" ? (zh ? "正在查询申请状态..." : "Checking application status...") : (zh ? "提交审核" : "Submit for review")) : (zh ? "登录后提交" : "Sign in to submit")}</button>
                    <a href={`/${lang}/account`}>{zh ? "查看账户记录" : "View account records"}</a>
                </div>
            {/if}
            {#if xMessage}<p class="x-error" role="alert">{xMessage}</p>{/if}
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
    button.action { border: 0; color: var(--accent-strong); cursor: pointer; }
    button.action:disabled { opacity: .65; cursor: not-allowed; }
    .x-form { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 20px; }
    .x-form input { max-width: 100%; }
    .x-form label { font-weight: 600; font-size: 14px; }
    .x-username { box-sizing: border-box; width: min(100%, 340px); padding: 10px 12px; border: 1px solid var(--popup-stroke); border-radius: 8px; background: var(--background); color: var(--text); font-size: 15px; }
    .x-preview { display: flex; gap: 14px; align-items: center; width: min(100%, 500px); box-sizing: border-box; padding: 12px; border: 1px solid var(--popup-stroke); border-radius: 10px; }
    .x-preview img { width: 90px; height: 90px; object-fit: contain; border-radius: 6px; background: #f1f1f1; }
    .x-preview div { display: flex; min-width: 0; flex-direction: column; gap: 5px; font-size: 13px; }
    .x-preview span { overflow-wrap: anywhere; }
    .x-preview small { color: var(--subtext); }
    .x-status { display: flex; gap: 12px; margin: 18px 0 14px; padding: 16px; border-radius: 10px; background: var(--accent-background); }
    .x-status-icon { flex: none; font-size: 21px; color: var(--accent-strong); }
    .x-status p { margin: 5px 0; }
    .x-submit { min-width: 150px; justify-content: center; }
    .x-error { color: #bd3030; font-weight: 600; }
    .x-hint { margin: 12px 0 0; }
    .x-retry { border: 0; padding: 0; color: var(--accent-strong); background: none; text-decoration: underline; cursor: pointer; font: inherit; }
    footer > a, footer :global(a) { display: inline-block; margin: 0 20px 10px 0; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    @media (max-width: 600px) { .free-points { padding: 20px 16px 100px; } section { padding: 20px 16px; } h2 { font-size: 19px; } }
</style>
