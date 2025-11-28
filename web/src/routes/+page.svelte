<script lang="ts">
    import { t, INTERNAL_locale } from "$lib/i18n/translations";
    import { onMount } from 'svelte';

    import Omnibox from "$components/save/Omnibox.svelte";
    import Meowbalt from "$components/misc/Meowbalt.svelte";
    import SupportedServices from "$components/save/SupportedServices.svelte";
    import UserGuide from "$components/misc/UseGuide.svelte";
    /*import Header from "$components/misc/Header.svelte"; // 导航栏组件
    import BlogPreview from "$components/blog/BlogPreview.svelte"; // 博客预览组件*/
    const donateLinks: Record<'en' | 'th' | 'zh' | 'ru', string> = {
        en: "https://buy.stripe.com/8wM5o6bHMeoO9oc8wz",
        th: "https://buy.stripe.com/dR6bMu5jobcC57W3ce",
        zh: "https://buy.stripe.com/5kAeYG7rwgwW43S4gh",
        ru: "https://buy.stripe.com/5kAeYG7rwgwW43S4gh",
    };
    let key: string = $INTERNAL_locale;
    const donateLink = donateLinks[key as keyof typeof donateLinks];    let showMindsou = false;
    let showYumcheck = false;
    let showNotification = true; // 控制通知显示

    // 检查本地存储中是否已关闭通知
    onMount(() => {
        const notificationClosed = localStorage.getItem('notification-finditbuddy-launch-closed');
        if (notificationClosed === 'true') {
            showNotification = false;
        }
    });

    // 关闭通知并保存状态到本地存储
    const closeNotification = () => {
        showNotification = false;
        localStorage.setItem('notification-finditbuddy-launch-closed', 'true');
    };
</script>

<svelte:head>
    <title>{$t("general.seo.home.title")}</title>
    <meta name="description" content={$t("general.seo.home.description")} />
    <meta name="keywords" content={$t("general.seo.home.keywords")} />
    <meta property="og:title" content={$t("general.seo.home.title")} />
    <meta property="og:description" content={$t("general.seo.home.description")} />
</svelte:head>

<!--<Header />-->

<div id="cobalt-save-container" class="center-column-container">
    <SupportedServices />
    <main
        id="cobalt-save"
        tabindex="-1"
        data-first-focus
        data-focus-ring-hidden
    >
        <!-- 通知信息 -->
        {#if showNotification}
            <div class="notification" role="alert">
                <button 
                    class="notification-close" 
                    aria-label={$t("general.notification.close")}
                    on:click={closeNotification}
                >
                    ×
                </button>
                <div class="notification-content">
                    <span class="notification-icon">📢</span>
                    <span class="notification-text">
                        {$t("general.notification.title")}
                        <br>
                        {@html $t("general.notification.youtube_restriction").replace('https://www.bilibili.com/video/BV1Bp4EzeEJo', '<a href="https://www.bilibili.com/video/BV1Bp4EzeEJo" target="_blank" rel="noopener noreferrer" class="notification-link">https://www.bilibili.com/video/BV1Bp4EzeEJo</a>')}
                    </span>
                </div>
            </div>
        {/if}
        
        <Meowbalt emotion="smile" />
        <Omnibox />
        <!--<UserGuide/>-->
    </main>

    <!-- 引流推广模块 -->
    <section id="promotions">
        <!-- Mindsou Accordion -->
        <section id="mindsou">
            <button
                type="button"
                class="accordion-header"
                aria-expanded={showMindsou}
                on:click={() => showMindsou = !showMindsou}
            >
                <img src="/popularize/mindsou_logo.png"
                     alt="Mindsou Logo"
                     class="section-icon" />
                <span>{$t("general.promotions.mindsou.title")}</span>
                <span class="arrow">{showMindsou ? '▲' : '▼'}</span>
            </button>
            {#if showMindsou}
                <div class="details" role="region">
                    <ul> 
                        <li>{$t("general.promotions.mindsou.features.1")}</li>
                        <li>{$t("general.promotions.mindsou.features.2")}</li>
                        <li>{$t("general.promotions.mindsou.features.3")}</li>
                        <li>{$t("general.promotions.mindsou.features.4")}</li>
                        <li>{$t("general.promotions.mindsou.features.5")}</li>
                    </ul>
                    <a class="button" href="https://mindsou.online" target="_blank" rel="noopener noreferrer">
                        {$t("general.promotions.mindsou.visit")}
                    </a>
                </div>
            {/if}
        </section>

        <!-- YumCheck Accordion -->
        <section id="yumcheck">
            <button
                type="button"
                class="accordion-header"
                aria-expanded={showYumcheck}
                on:click={() => showYumcheck = !showYumcheck}
            >
                <img src="/popularize/yumcheck.ico"
                     alt="YumCheck Logo"
                     class="section-icon" />
                <span>{$t("general.promotions.yumcheck.title")}</span>
                <span class="arrow">{showYumcheck ? '▲' : '▼'}</span>
            </button>
            {#if showYumcheck}
                <div class="details" role="region">
                    <ul>
                        <li>{$t("general.promotions.yumcheck.features.1")}</li>
                        <li>{$t("general.promotions.yumcheck.features.2")}</li>
                        <li>{$t("general.promotions.yumcheck.features.3")}</li>
                        <li>{$t("general.promotions.yumcheck.features.4")}</li>
                    </ul>
                    <a class="button" href="https://yumcheck.online" target="_blank" rel="noopener noreferrer">
                        {$t("general.promotions.yumcheck.visit")}
                    </a>
                </div>
            {/if}
        </section>
    </section>
</div>

<style>
    #cobalt-save-container {
        padding: var(--padding);
        /* 允许纵向滚动，移除 overflow:hidden 限制 */
        overflow-y: auto;
        overflow-x: hidden;
        justify-content: space-between;
        min-height: 100%;
        box-sizing: border-box;
    }

    #cobalt-save {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        flex: 1;
        gap: 15px;
    }

    ul {
        list-style: disc;
        padding-left: var(--padding);
    }

    a {
        text-decoration: none;
        color: var(--blue);
    }

    .button {
        display: inline-block;
        padding: 10px 20px;
        background-color: var(--secondary);
        color: var(--primary);
        border-radius: var(--border-radius);
        text-align: center;
    }

    /* 推广模块样式 */
    #promotions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--padding);
        padding: var(--padding) 0;
    }
    #promotions > section {
        display: flex;
        flex-direction: column;
        padding: var(--padding);
        background-color: var(--popup-bg);
        border-radius: var(--border-radius);
        width: 100%;
        max-width: 640px;
        box-sizing: border-box;
        gap: 12px;
        transition: all 0.3s ease;
    }

    .accordion-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        padding: var(--padding);
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        transition: background 0.2s;
        gap: 8px;
    }
    .accordion-header:hover {
        background: var(--secondary-bg);
    }
    .arrow {
        font-size: 0.9rem;
    }
    .details {
        padding: calc(var(--padding) / 2) var(--padding);
        background: var(--popup-bg);
        border-bottom-left-radius: var(--border-radius);
        border-bottom-right-radius: var(--border-radius);
        margin-bottom: var(--padding);
        animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* Mindsou 与 YumCheck 模块样式覆盖（默认暗色） */
    #promotions > section#mindsou,
    #promotions > section#yumcheck {
        background-color: var(--popup-bg);
        color: var(--primary);
    }

    /* Center‑align YumCheck 标题与箭头 */
    #promotions > section#yumcheck .accordion-header {
        justify-content: center;
        text-align: center;     /* 万一有多行文字也会居中 */
    }

    /* Light 模式：使用深绿背景 + 白字 */
    @media (prefers-color-scheme: light) {
        #promotions > section#mindsou,
        #promotions > section#yumcheck {
            background-color: var(--secondary);
            color: #ffffff;
        }
        #promotions .accordion-header,
        #promotions .details {
            background: transparent;
            color: inherit;
        }
        #promotions .accordion-header:hover {
            background-color: #FFB02E;
        }
        #promotions a.button {
            background-color: #ffffff;
            color: var(--secondary);
        }
    }

    /* Dark 模式：文字白色 */
    @media (prefers-color-scheme: dark) {
        #promotions > section#mindsou,
        #promotions > section#yumcheck {
            color: #ffffff;
        }
        #promotions a.button {
            color: #ffffff;
        }
    }

    @media screen and (max-width: 535px) {
        #cobalt-save-container {
            padding-top: calc(var(--padding) / 2);
        }
    }

    /* 图标尺寸 & 间距 */
    .section-icon {
        width: 24px;
        height: 24px;
        margin: 0; /* 左右间距由 gap 控制 */
    }

    /* 确保小屏时不溢出 */
    #promotions > section .section-icon {
        max-width: 100%;
    }    /* 通知组件样式 */
    .notification {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--padding);
        background-color: #e8f5e8;
        color: #2e7d32;
        border-radius: var(--border-radius);
        width: 100%;
        max-width: 640px;
        box-sizing: border-box;
        margin-bottom: var(--padding);
        animation: slideIn 0.5s ease-out;
        border: 1px solid #c8e6c9;
    }
    .notification-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 10px;
    }
    .notification-icon {
        font-size: 1.5rem;
        margin-right: 10px;
    }
    .notification-text {
        flex: 1;
        font-size: 0.9rem;
    }    .notification-close {
        background: none;
        border: none;
        color: inherit;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0;
        margin-left: 10px;
        transition: opacity 0.2s;
    }
    .notification-close:hover {
        opacity: 0.7;
    }

    .notification-link {
        color: #1976d2;
        text-decoration: underline;
        font-weight: 500;
        margin: 0 4px;
        transition: color 0.2s;
    }

    .notification-link:hover {
        color: #1565c0;
        text-decoration: none;
    }

    /* 深色模式下的通知样式 */
    @media (prefers-color-scheme: dark) {
        .notification {
            background-color: #1b3e1f;
            color: #81c784;
            border-color: #2e7d32;
        }
        
        .notification-link {
            color: #64b5f6;
        }
        
        .notification-link:hover {
            color: #90caf9;
        }
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    /* overrides for notification layout */
    .notification { position: relative; }
    .notification-content { align-items: flex-start; padding-right: 28px; }
    .notification-close { position: absolute; top:6px; right:8px; margin-left:0; padding:4px; line-height:1; }
</style>
