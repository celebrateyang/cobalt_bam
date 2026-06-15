<script lang="ts">
    import { page } from "$app/stores";
    import env from "$lib/env";

    const supportEmail = "celebrateyang@gmail.com";
    const fallbackHost = env.HOST || "freesavevideo.online";

    $: lang = $page.params.lang || "en";
    $: isZh = lang === "zh";
    $: origin = `https://${fallbackHost}`;
    $: canonicalUrl = `${origin}/${lang}/support`;

    $: copy = isZh
        ? {
              metaTitle: "支持信息 | FreeSaveVideo",
              metaDescription:
                  "FreeSaveVideo 支持信息页面，包含联系邮箱、反馈入口、常见问题、隐私政策和使用条款。",
              title: "FreeSaveVideo 支持信息",
              intro:
                  "遇到下载、账号、积分、浏览器扩展或网站使用问题，可以通过本页找到支持入口。",
              emailTitle: "联系邮箱",
              emailBody:
                  "请尽量附上出问题的页面链接、平台名称、浏览器/设备信息，以及错误提示截图或文字。",
              responseTitle: "响应时间",
              responseBody:
                  "通常会在 1-3 个工作日内查看邮件或站内反馈。复杂的平台解析问题可能需要更长时间复现。",
              feedbackTitle: "站内反馈",
              feedbackBody:
                  "如果你已经登录，推荐使用站内反馈入口提交问题，这样更方便关联账号和定位下载记录。",
              faqTitle: "自助排查",
              faqBody:
                  "常见下载失败、隐私边界、积分和支持平台问题，可以先查看 FAQ。",
              policyTitle: "政策与合规",
              policyBody:
                  "FreeSaveVideo 仅面向公开可访问内容。请尊重版权、平台规则和创作者权益。",
              actions: {
                  email: "发送邮件",
                  feedback: "提交站内反馈",
                  faq: "查看 FAQ",
                  privacy: "隐私政策",
                  terms: "使用条款",
                  home: "返回首页",
              },
          }
        : {
              metaTitle: "Support Information | FreeSaveVideo",
              metaDescription:
                  "FreeSaveVideo support information page with contact email, feedback, FAQ, privacy policy, and terms links.",
              title: "FreeSaveVideo Support",
              intro:
                  "Use this page for help with downloads, accounts, credits, browser extension issues, or general website questions.",
              emailTitle: "Contact Email",
              emailBody:
                  "Please include the affected page URL, platform name, browser/device details, and any visible error message or screenshot.",
              responseTitle: "Response Time",
              responseBody:
                  "Support messages are usually reviewed within 1-3 business days. Complex parser issues can take longer to reproduce.",
              feedbackTitle: "In-Site Feedback",
              feedbackBody:
                  "If you are signed in, the in-site feedback form is recommended because it can help connect the report with your account and download context.",
              faqTitle: "Self-Service Help",
              faqBody:
                  "For common download failures, privacy boundaries, credits, and supported platform questions, start with the FAQ.",
              policyTitle: "Policy and Compliance",
              policyBody:
                  "FreeSaveVideo is intended for publicly accessible content only. Please respect copyright, platform rules, and creator rights.",
              actions: {
                  email: "Email Support",
                  feedback: "Open Feedback",
                  faq: "Read FAQ",
                  privacy: "Privacy Policy",
                  terms: "Terms",
                  home: "Back Home",
              },
          };

    $: supportJsonLd = {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        name: copy.title,
        url: canonicalUrl,
        inLanguage: lang,
        contactPoint: {
            "@type": "ContactPoint",
            email: supportEmail,
            contactType: "customer support",
            availableLanguage: ["English", "Chinese"],
        },
    };

    $: supportJsonLdText = JSON.stringify(supportJsonLd);
</script>

<svelte:head>
    <title>{copy.metaTitle}</title>
    <meta name="description" content={copy.metaDescription} />
    <link rel="canonical" href={canonicalUrl} />

    <meta property="og:title" content={copy.metaTitle} />
    <meta property="og:description" content={copy.metaDescription} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:image" content={`${origin}/og.png`} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={copy.metaTitle} />
    <meta name="twitter:description" content={copy.metaDescription} />
    <meta name="twitter:image" content={`${origin}/og.png`} />

    <svelte:element this="script" type="application/ld+json">
        {supportJsonLdText}
    </svelte:element>
</svelte:head>

<main id="support">
    <header class="hero">
        <p class="eyebrow">FreeSaveVideo</p>
        <h1>{copy.title}</h1>
        <p class="lede">{copy.intro}</p>
        <div class="hero-actions">
            <a class="button primary" href={`mailto:${supportEmail}`}>{copy.actions.email}</a>
            <a class="button" href={`/${lang}?feedback=1`}>{copy.actions.feedback}</a>
        </div>
    </header>

    <section class="support-grid" aria-label="Support options">
        <article class="panel contact-panel">
            <h2>{copy.emailTitle}</h2>
            <a class="email" href={`mailto:${supportEmail}`}>{supportEmail}</a>
            <p>{copy.emailBody}</p>
        </article>

        <article class="panel">
            <h2>{copy.responseTitle}</h2>
            <p>{copy.responseBody}</p>
        </article>

        <article class="panel">
            <h2>{copy.feedbackTitle}</h2>
            <p>{copy.feedbackBody}</p>
            <a class="text-link" href={`/${lang}?feedback=1`}>{copy.actions.feedback}</a>
        </article>

        <article class="panel">
            <h2>{copy.faqTitle}</h2>
            <p>{copy.faqBody}</p>
            <a class="text-link" href={`/${lang}/faq`}>{copy.actions.faq}</a>
        </article>

        <article class="panel policy-panel">
            <h2>{copy.policyTitle}</h2>
            <p>{copy.policyBody}</p>
            <div class="policy-links">
                <a class="text-link" href={`/${lang}/about/privacy`}>{copy.actions.privacy}</a>
                <a class="text-link" href={`/${lang}/about/terms`}>{copy.actions.terms}</a>
            </div>
        </article>
    </section>

    <nav class="footer-actions" aria-label="Support navigation">
        <a class="button" href={`/${lang}`}>{copy.actions.home}</a>
        <a class="button" href={`/${lang}/faq`}>{copy.actions.faq}</a>
    </nav>
</main>

<style>
    #support {
        width: 100%;
        max-width: 980px;
        margin: 0 auto 24px;
        padding: calc(var(--padding) * 2) var(--padding);
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .hero,
    .panel {
        background: var(--surface-1, var(--popup-bg));
        border: 1px solid var(--surface-2, var(--popup-stroke));
        border-radius: 8px;
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.06);
    }

    .hero {
        padding: 24px;
    }

    .eyebrow {
        margin: 0 0 8px;
        color: var(--accent);
        font-weight: 800;
        font-size: 0.86rem;
    }

    h1,
    h2,
    p {
        margin: 0;
    }

    h1 {
        color: var(--text);
        font-size: clamp(26px, 4vw, 38px);
        line-height: 1.12;
    }

    h2 {
        color: var(--text);
        font-size: 1.05rem;
        line-height: 1.3;
    }

    .lede,
    .panel p {
        color: var(--subtext);
        line-height: 1.65;
    }

    .lede {
        max-width: 720px;
        margin-top: 10px;
        font-size: 1rem;
    }

    .hero-actions,
    .footer-actions,
    .policy-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hero-actions {
        margin-top: 18px;
    }

    .support-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
    }

    .panel {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .contact-panel,
    .policy-panel {
        grid-column: 1 / -1;
    }

    .email {
        color: var(--text);
        font-size: clamp(1rem, 3vw, 1.45rem);
        font-weight: 800;
        overflow-wrap: anywhere;
        text-decoration: none;
    }

    .email:hover,
    .text-link:hover {
        color: var(--accent);
    }

    .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 10px 14px;
        border-radius: 8px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: var(--button);
        box-shadow: var(--button-box-shadow);
        color: var(--text);
        font-weight: 800;
        font-size: 0.93rem;
        text-decoration: none;
        white-space: nowrap;
    }

    .button:hover {
        background: var(--button-hover);
    }

    .button.primary {
        background: var(--accent);
        border-color: transparent;
        color: var(--white);
        box-shadow: none;
    }

    .button.primary:hover {
        background: var(--accent-hover);
    }

    .text-link {
        color: var(--text);
        font-weight: 800;
        text-underline-offset: 3px;
    }

    .footer-actions {
        justify-content: flex-start;
    }

    @media (max-width: 700px) {
        #support {
            padding: calc(var(--padding) * 1.5) var(--padding);
        }

        .hero,
        .panel {
            padding: 16px;
        }

        .support-grid {
            grid-template-columns: 1fr;
        }

        .button {
            width: 100%;
            white-space: normal;
            text-align: center;
        }
    }
</style>
