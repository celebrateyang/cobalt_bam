<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import { get } from "svelte/store";

    import { curiousCat, type CuriousCatActivity } from "$lib/api/curious-cat";
    import { clerkUser, isSignedIn } from "$lib/state/clerk";
    import { queue } from "$lib/state/task-manager/queue";

    const SESSION_KEY = "curious_cat_session_closed_v1";
    const DAILY_PREFIX = "curious_cat_daily_v1:";
    const MUTE_KEY = "curious_cat_muted_v1";
    const IDLE_DELAY_MS = 60_000;
    const MAX_DAILY_SHOWS = 3;

    const fallbackActivities: CuriousCatActivity[] = [
        {
            id: -1,
            name: "blind-box",
            activity_type: "blind_box",
            title: "喵，我发现了一批盲盒链接",
            body: "这些链接来自其他用户成功下载过的记录，只显示链接，不显示是谁下载的。试试手气，可能会发现新的好内容。",
            button_text: "去开盲盒",
            action_type: "blind_box",
            target_url: null,
            image_url: null,
            copy_text: null,
            reward_points: null,
            priority: 1,
            is_active: true,
            starts_at: null,
            ends_at: null,
            created_at: Date.now(),
            updated_at: Date.now(),
        },
        {
            id: -2,
            name: "referral",
            activity_type: "referral",
            title: "喵，分享专属链接可以赚积分",
            body: "进入账号页面，复制你的专属邀请链接，分享给朋友使用 Freesavevideo。",
            button_text: "查看专属链接",
            action_type: "link",
            target_url: "/{lang}/account?section=referral",
            image_url: null,
            copy_text: null,
            reward_points: null,
            priority: 0,
            is_active: true,
            starts_at: null,
            ends_at: null,
            created_at: Date.now(),
            updated_at: Date.now(),
        },
    ];

    let activities: CuriousCatActivity[] = [];
    let selected: CuriousCatActivity | null = null;
    let visible = false;
    let detailOpen = false;
    let muted = false;
    let idleTimer: number | null = null;
    let unsubQueue: (() => void) | null = null;
    let unsubSignedIn: (() => void) | null = null;
    let seenDoneIds = new Set<string>();
    let audioContext: AudioContext | null = null;
    let soundUnlocked = false;

    $: lang = $page.params.lang || "zh";

    const getDailyKey = () => {
        const user = get(clerkUser);
        const userId = user?.id || "anonymous";
        const date = new Date().toISOString().slice(0, 10);
        return `${DAILY_PREFIX}${userId}:${date}`;
    };

    const getDailyCount = () => {
        if (typeof window === "undefined") return 0;
        return Number.parseInt(window.localStorage.getItem(getDailyKey()) || "0", 10) || 0;
    };

    const incrementDailyCount = () => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(getDailyKey(), String(getDailyCount() + 1));
    };

    const canShow = () => {
        if (typeof window === "undefined") return false;
        if (!get(isSignedIn)) return false;
        if (visible) return false;
        if (window.sessionStorage.getItem(SESSION_KEY) === "1") return false;
        return getDailyCount() < MAX_DAILY_SHOWS;
    };

    const getAudioContext = () => {
        if (typeof window === "undefined") return null;
        if (audioContext) return audioContext;

        const AudioContextImpl =
            window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextImpl) return null;

        audioContext = new AudioContextImpl();
        return audioContext;
    };

    const unlockSound = () => {
        soundUnlocked = true;
        const ctx = getAudioContext();
        if (ctx?.state === "suspended") {
            void ctx.resume().catch(() => {});
        }
    };

    const playMeow = async () => {
        if (muted || typeof window === "undefined") return;
        const ctx = getAudioContext();
        if (!ctx || !soundUnlocked) return;

        try {
            if (ctx.state === "suspended") {
                await ctx.resume();
            }
            if (ctx.state !== "running") return;

            const gain = ctx.createGain();
            const osc = ctx.createOscillator();
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
            osc.frequency.setValueAtTime(520, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + 0.12);
            osc.frequency.exponentialRampToValueAtTime(610, ctx.currentTime + 0.24);
            osc.type = "sine";
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.26);
        } catch {
            // Browser autoplay policies may block this, and the visual prompt still works.
        }
    };

    const pickActivity = () => {
        const pool = activities.length ? activities : fallbackActivities;
        const sorted = [...pool].sort((a, b) => {
            const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
            if (priorityDiff !== 0) return priorityDiff;
            return b.id - a.id;
        });
        const topPriority = Number(sorted[0]?.priority || 0);
        const candidates = sorted.filter((item) => Number(item.priority || 0) === topPriority);
        return candidates[Math.floor(Math.random() * candidates.length)] || sorted[0] || null;
    };

    const show = () => {
        if (!canShow()) return;
        selected = pickActivity();
        if (!selected) return;
        visible = true;
        incrementDailyCount();
        void playMeow();
    };

    const close = () => {
        visible = false;
        detailOpen = false;
        if (typeof window !== "undefined") {
            window.sessionStorage.setItem(SESSION_KEY, "1");
        }
    };

    const toggleMute = () => {
        muted = !muted;
        if (typeof window !== "undefined") {
            window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
        }
    };

    const resolveTarget = (target: string | null | undefined) => {
        if (!target) return `/${lang}/discover?tab=blind-box`;
        return target.replace("{lang}", lang);
    };

    const runAction = async () => {
        if (!selected) return;

        if (selected.action_type === "modal") {
            detailOpen = true;
            return;
        }

        const target =
            selected.action_type === "blind_box"
                ? `/${lang}/discover?tab=blind-box`
                : resolveTarget(selected.target_url);

        close();
        await goto(target);
    };

    const loadActivities = async () => {
        if (!get(isSignedIn)) return;
        try {
            const response = await curiousCat.activities();
            if (response.status === "success" && Array.isArray(response.data?.activities)) {
                activities = response.data.activities;
            }
        } catch (error) {
            console.debug("Curious cat activities failed to load", error);
        } finally {
        }
    };

    const armIdleTimer = () => {
        if (idleTimer) window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => show(), IDLE_DELAY_MS);
    };

    onMount(() => {
        muted = window.localStorage.getItem(MUTE_KEY) === "1";
        window.addEventListener("pointerdown", unlockSound, {
            passive: true,
        });
        window.addEventListener("keydown", unlockSound);

        unsubSignedIn = isSignedIn.subscribe((signedIn) => {
            if (!signedIn) return;
            void loadActivities();
            armIdleTimer();
        });

        unsubQueue = queue.subscribe((items) => {
            for (const [id, item] of Object.entries(items)) {
                if (item.state !== "done") continue;
                if (seenDoneIds.has(id)) continue;
                seenDoneIds = new Set([...seenDoneIds, id]);
                window.setTimeout(() => show(), 3500);
            }
        });
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            if (idleTimer) window.clearTimeout(idleTimer);
            window.removeEventListener("pointerdown", unlockSound);
            window.removeEventListener("keydown", unlockSound);
        }
        unsubQueue?.();
        unsubSignedIn?.();
    });
</script>

{#if visible && selected}
    <div class="curious-cat" aria-live="polite">
        <div class="bubble">
            <div class="bubble-kicker">好奇猫</div>
            <h2>{selected.title}</h2>
            <p>{selected.body}</p>
            {#if Number.isFinite(selected.reward_points)}
                <div class="reward">可获得 {selected.reward_points} 积分</div>
            {/if}
            <div class="actions">
                <button class="secondary" type="button" on:click={toggleMute}>
                    {muted ? "开声音" : "静音"}
                </button>
                <button class="secondary" type="button" on:click={close}>关闭</button>
                <button class="primary" type="button" on:click={runAction}>
                    {selected.button_text}
                </button>
            </div>
        </div>
        <button class="cat" type="button" aria-label="好奇猫" on:click={runAction}>
            <span class="ear ear-left"></span>
            <span class="ear ear-right"></span>
            <span class="face">
                <span class="eye eye-left"></span>
                <span class="eye eye-right"></span>
                <span class="nose"></span>
                <span class="whisker whisker-left"></span>
                <span class="whisker whisker-right"></span>
            </span>
            <span class="paw">?</span>
        </button>
    </div>
{/if}

{#if detailOpen && selected}
    <div class="detail-backdrop" role="presentation" on:click={() => (detailOpen = false)}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <section class="detail" role="dialog" aria-modal="true" aria-label={selected.title} on:click|stopPropagation>
            <h2>{selected.title}</h2>
            <p>{selected.body}</p>
            {#if selected.image_url}
                <img src={selected.image_url} alt={selected.title} />
            {/if}
            {#if selected.copy_text}
                <textarea readonly value={selected.copy_text}></textarea>
            {/if}
            <div class="detail-actions">
                <button type="button" class="secondary" on:click={() => (detailOpen = false)}>
                    关闭
                </button>
            </div>
        </section>
    </div>
{/if}

<style>
    .curious-cat {
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(18px, env(safe-area-inset-bottom));
        z-index: 80;
        display: flex;
        align-items: end;
        gap: 10px;
        animation: cat-in 0.42s ease-out;
    }

    .bubble {
        width: min(320px, calc(100vw - 116px));
        padding: 14px;
        border-radius: 8px;
        background: var(--popup-bg);
        color: var(--button-text);
        box-shadow:
            0 16px 36px rgba(0, 0, 0, 0.18),
            0 0 0 1.5px var(--popup-stroke) inset;
    }

    .bubble-kicker {
        font-size: 0.72rem;
        color: var(--accent);
        font-weight: 800;
        margin-bottom: 4px;
    }

    .bubble h2 {
        margin: 0 0 6px;
        font-size: 1rem;
        line-height: 1.25;
        color: var(--button-text);
    }

    .bubble p {
        margin: 0;
        color: var(--gray);
        font-size: 0.86rem;
        line-height: 1.55;
        white-space: pre-wrap;
    }

    .reward {
        margin-top: 8px;
        font-size: 0.8rem;
        font-weight: 800;
        color: var(--accent);
    }

    .actions,
    .detail-actions {
        margin-top: 12px;
        display: flex;
        gap: 8px;
        justify-content: end;
        flex-wrap: wrap;
    }

    button {
        border: none;
        border-radius: 8px;
        min-height: 34px;
        padding: 8px 11px;
        font-weight: 800;
        cursor: pointer;
        color: var(--button-text);
        background: var(--button);
    }

    .primary {
        color: var(--white);
        background: var(--accent);
    }

    .secondary:hover {
        background: var(--button-hover);
    }

    .primary:hover {
        background: var(--accent-hover);
    }

    .cat {
        position: relative;
        width: 76px;
        height: 76px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: transparent;
        padding: 0;
        animation: cat-bob 2.6s ease-in-out infinite;
    }

    .face {
        position: absolute;
        inset: 9px 8px 7px;
        border-radius: 48% 48% 44% 44%;
        background:
            radial-gradient(circle at 36% 40%, #fff 0 13px, transparent 14px),
            radial-gradient(circle at 63% 42%, #fff 0 12px, transparent 13px),
            #f6a33e;
        box-shadow:
            0 10px 20px rgba(0, 0, 0, 0.18),
            inset 0 -5px 0 rgba(0, 0, 0, 0.08);
    }

    .ear {
        position: absolute;
        top: 3px;
        width: 25px;
        height: 29px;
        background: #f6a33e;
        border-radius: 7px 15px 4px 15px;
    }

    .ear-left {
        left: 11px;
        transform: rotate(-28deg);
    }

    .ear-right {
        right: 11px;
        transform: rotate(28deg) scaleX(-1);
    }

    .eye {
        position: absolute;
        top: 28px;
        width: 7px;
        height: 9px;
        border-radius: 50%;
        background: #1e2328;
    }

    .eye-left {
        left: 25px;
    }

    .eye-right {
        right: 25px;
    }

    .nose {
        position: absolute;
        left: 50%;
        top: 40px;
        width: 8px;
        height: 6px;
        border-radius: 50%;
        transform: translateX(-50%);
        background: #e05252;
    }

    .whisker {
        position: absolute;
        top: 43px;
        width: 18px;
        height: 2px;
        border-radius: 99px;
        background: rgba(30, 35, 40, 0.5);
    }

    .whisker-left {
        left: 7px;
        transform: rotate(8deg);
    }

    .whisker-right {
        right: 7px;
        transform: rotate(-8deg);
    }

    .paw {
        position: absolute;
        right: -2px;
        bottom: 6px;
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--accent);
        color: var(--white);
        font-weight: 900;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
    }

    .detail-backdrop {
        position: fixed;
        inset: 0;
        z-index: 90;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.38);
    }

    .detail {
        width: min(420px, 100%);
        border-radius: 8px;
        padding: 18px;
        background: var(--popup-bg);
        color: var(--button-text);
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.24);
    }

    .detail h2 {
        margin: 0 0 10px;
        font-size: 1.12rem;
    }

    .detail p {
        margin: 0 0 12px;
        line-height: 1.65;
        color: var(--gray);
        white-space: pre-wrap;
    }

    .detail img {
        display: block;
        width: min(260px, 100%);
        aspect-ratio: 1;
        object-fit: contain;
        margin: 8px auto 12px;
        border-radius: 8px;
        background: var(--button);
    }

    .detail textarea {
        width: 100%;
        min-height: 96px;
        resize: vertical;
        border: 1.5px solid var(--popup-stroke);
        border-radius: 8px;
        padding: 10px;
        color: var(--button-text);
        background: var(--button);
    }

    @keyframes cat-in {
        from {
            opacity: 0;
            transform: translate(24px, 34px);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }

    @keyframes cat-bob {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-4px);
        }
    }

    @media (max-width: 620px) {
        .curious-cat {
            right: 12px;
            bottom: calc(78px + env(safe-area-inset-bottom));
        }

        .bubble {
            width: min(280px, calc(100vw - 102px));
        }

        .cat {
            width: 66px;
            height: 66px;
        }
    }
</style>
