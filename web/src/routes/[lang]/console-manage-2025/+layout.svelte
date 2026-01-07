<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    import { auth } from "$lib/api/social";

    import PageNavSection from "$components/subnav/PageNavSection.svelte";
    import PageNavTab from "$components/subnav/PageNavTab.svelte";

    import IconUserCircle from "@tabler/icons-svelte/IconUserCircle.svelte";
    import IconVideo from "@tabler/icons-svelte/IconVideo.svelte";
    import IconUsersGroup from "@tabler/icons-svelte/IconUsersGroup.svelte";
    import IconCoin from "@tabler/icons-svelte/IconCoin.svelte";
    import IconBug from "@tabler/icons-svelte/IconBug.svelte";
    import IconLogout from "@tabler/icons-svelte/IconLogout.svelte";

    $: lang = $page.params.lang;
    $: pathname = $page.url.pathname;
    $: isLoginPage =
        pathname === `/${lang}/console-manage-2025` ||
        pathname === `/${lang}/console-manage-2025/`;

    const handleLogout = () => {
        auth.logout();
        goto(`/${lang}/console-manage-2025`);
    };
</script>

{#if isLoginPage}
    <slot />
{:else}
    <div class="admin-shell">
        <aside class="admin-sidebar">
            <div class="admin-sidebar-header">
                <div class="subtext admin-subtitle">console-manage-2025</div>
                <h2 class="admin-title">管理后台</h2>
            </div>

            <nav class="admin-nav">
                <PageNavSection sectionTitle="内容管理">
                    <PageNavTab
                        tabPath="/{lang}/console-manage-2025/accounts"
                        tabTitle="账号管理"
                        iconColor="green"
                    >
                        <IconUserCircle />
                    </PageNavTab>
                    <PageNavTab
                        tabPath="/{lang}/console-manage-2025/videos"
                        tabTitle="视频管理"
                        iconColor="blue"
                    >
                        <IconVideo />
                    </PageNavTab>
                </PageNavSection>

                <PageNavSection sectionTitle="用户与订单">
                    <PageNavTab
                        tabPath="/{lang}/console-manage-2025/users"
                        tabTitle="用户管理"
                        iconColor="gray"
                    >
                        <IconUsersGroup />
                    </PageNavTab>
                    <PageNavTab
                        tabPath="/{lang}/console-manage-2025/orders"
                        tabTitle="订单管理"
                        iconColor="gray"
                    >
                        <IconCoin />
                    </PageNavTab>
                </PageNavSection>

                <PageNavSection sectionTitle="支持">
                    <PageNavTab
                        tabPath="/{lang}/console-manage-2025/feedback"
                        tabTitle="问题反馈"
                        iconColor="gray"
                    >
                        <IconBug />
                    </PageNavTab>
                </PageNavSection>

                <div class="logout-wrap">
                    <button class="logout-button" type="button" on:click={handleLogout}>
                        <span class="logout-icon"><IconLogout /></span>
                        退出登录
                    </button>
                </div>
            </nav>
        </aside>

        <main class="admin-content">
            <slot />
        </main>
    </div>
{/if}

<style>
    .admin-shell {
        --admin-nav-width: 250px;
        --admin-padding: 30px;
        display: grid;
        grid-template-columns: var(--admin-nav-width) 1fr;
        gap: calc(var(--padding) * 1.5);
        width: 100%;
        padding-left: var(--admin-padding);
    }

    .admin-sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
        padding-top: var(--admin-padding);
        padding-bottom: var(--admin-padding);
        display: flex;
        flex-direction: column;
        gap: var(--padding);
    }

    .admin-sidebar-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .admin-subtitle {
        padding: 0;
        letter-spacing: 0.2px;
        opacity: 0.85;
    }

    .admin-title {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 800;
        color: var(--secondary);
        letter-spacing: -0.3px;
    }

    .admin-nav {
        display: flex;
        flex-direction: column;
        gap: var(--padding);
        padding-bottom: var(--padding);
    }

    .logout-wrap {
        margin-top: auto;
        padding-top: calc(var(--padding) / 2);
    }

    .logout-button {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px;
        border: none;
        border-radius: var(--border-radius);
        background: var(--primary);
        color: var(--button-text);
        cursor: pointer;
        font-weight: 600;
    }

    .logout-button:hover {
        background: var(--button-hover-transparent);
    }

    .logout-button:active {
        background: var(--button-hover-transparent);
    }

    .logout-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        border-radius: 5px;
        background: var(--red);
        flex: 0 0 auto;
    }

    .logout-icon :global(svg) {
        stroke: var(--white);
        stroke-width: 1.6px;
        height: 20px;
        width: 20px;
    }

    .admin-content {
        min-width: 0;
    }

    @media screen and (max-width: 750px) {
        .admin-shell {
            grid-template-columns: 1fr;
            padding: 0;
        }

        .admin-sidebar {
            position: static;
            height: auto;
            padding: var(--padding);
        }
    }
</style>
