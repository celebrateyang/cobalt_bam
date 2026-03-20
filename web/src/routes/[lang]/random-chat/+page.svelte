<script lang="ts">
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";

    import { currentApiURL } from "$lib/api/api-url";
    import {
        checkSignedIn,
        clerkEnabled,
        getClerkToken,
        signIn,
    } from "$lib/state/clerk";
    import { RandomAvChatManager } from "$lib/chat/random-av-chat-manager";

    let manager: RandomAvChatManager | null = null;

    let localVideoEl: HTMLVideoElement | null = null;
    let remoteVideoEl: HTMLVideoElement | null = null;

    let localStream: MediaStream | null = null;
    let remoteStream: MediaStream | null = null;

    let signedIn = false;
    let checkingEligibility = false;
    let eligible = false;
    let requirePaidOrder = false;
    let hasPaidOrder = true;
    let connected = false;
    let searching = false;
    let inCall = false;
    let matchEndReason = "";
    let errorMessage = "";

    let expiresAt = 0;
    let countdown = "10:00";
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    $: currentLang = $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || "en";

    const clearCountdown = () => {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        countdown = "10:00";
        expiresAt = 0;
    };

    const updateCountdown = () => {
        if (!expiresAt) {
            countdown = "10:00";
            return;
        }

        const leftMs = Math.max(0, expiresAt - Date.now());
        const totalSec = Math.floor(leftMs / 1000);
        const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
        const ss = String(totalSec % 60).padStart(2, "0");
        countdown = `${mm}:${ss}`;
    };

    const startCountdown = (nextExpiresAt: number) => {
        clearCountdown();
        expiresAt = nextExpiresAt;
        updateCountdown();

        countdownTimer = setInterval(() => {
            updateCountdown();
        }, 1000);
    };

    const resetUiAfterCall = () => {
        inCall = false;
        searching = false;
        localStream = null;
        remoteStream = null;
        clearCountdown();
    };

    const refreshEligibility = async () => {
        checkingEligibility = true;
        errorMessage = "";

        try {
            signedIn = await checkSignedIn(800);
            if (!signedIn) {
                eligible = false;
                return;
            }

            const token = await getClerkToken();
            if (!token) {
                eligible = false;
                signedIn = false;
                return;
            }

            const res = await fetch(`${currentApiURL()}/user/chat/eligibility`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json().catch(() => null);

            if (!res.ok || data?.status !== "success") {
                throw new Error(
                    data?.error?.message || "Failed to check chat eligibility",
                );
            }

            eligible = Boolean(data?.data?.eligible);
            requirePaidOrder = Boolean(data?.data?.requirePaidOrder);
            hasPaidOrder = Boolean(data?.data?.hasPaidOrder);
        } catch (error) {
            eligible = false;
            errorMessage =
                error instanceof Error
                    ? error.message
                    : "Failed to check chat eligibility";
        } finally {
            checkingEligibility = false;
        }
    };

    const ensureManagerConnected = async () => {
        if (!manager) {
            throw new Error("Chat manager not initialized");
        }

        if (connected) {
            return;
        }

        const token = await getClerkToken();
        if (!token) {
            throw new Error("Missing Clerk token");
        }

        await manager.connect(token);
        connected = true;
    };

    const startMatching = async () => {
        if (!eligible) return;

        matchEndReason = "";
        errorMessage = "";

        try {
            await ensureManagerConnected();
            await manager?.startMatching();
            searching = true;
        } catch (error) {
            errorMessage =
                error instanceof Error ? error.message : "Failed to start matching";
        }
    };

    const cancelMatching = () => {
        manager?.cancelMatching();
        searching = false;
    };

    const leaveMatch = () => {
        manager?.leaveMatch();
        resetUiAfterCall();
    };

    const handleSignIn = async () => {
        await signIn();
        await refreshEligibility();
    };

    $: if (localVideoEl && localStream && localVideoEl.srcObject !== localStream) {
        localVideoEl.srcObject = localStream;
    }

    $: if (remoteVideoEl && remoteStream && remoteVideoEl.srcObject !== remoteStream) {
        remoteVideoEl.srcObject = remoteStream;
    }

    onMount(() => {
        manager = new RandomAvChatManager();

        const unsubscribers = [
            manager.on("socket_closed", () => {
                connected = false;
                searching = false;
                if (!inCall) {
                    clearCountdown();
                }
            }),
            manager.on("auth_ok", () => {
                errorMessage = "";
            }),
            manager.on("auth_failed", ({ reason, message }) => {
                connected = false;
                searching = false;
                inCall = false;
                if (reason === "payment_required") {
                    eligible = false;
                    requirePaidOrder = true;
                    hasPaidOrder = false;
                }
                errorMessage = message;
            }),
            manager.on("enqueued", () => {
                searching = true;
            }),
            manager.on("queue_cancelled", () => {
                searching = false;
            }),
            manager.on("matched", ({ expiresAt: matchExpiresAt }) => {
                searching = false;
                inCall = true;
                matchEndReason = "";
                startCountdown(matchExpiresAt);
            }),
            manager.on("match_ended", ({ reason }) => {
                matchEndReason = reason;
                resetUiAfterCall();
            }),
            manager.on("local_stream", ({ stream }) => {
                localStream = stream;
            }),
            manager.on("remote_stream", ({ stream }) => {
                remoteStream = stream;
            }),
            manager.on("error", ({ message }) => {
                errorMessage = message;
            }),
        ];

        void refreshEligibility();

        return () => {
            for (const unsubscribe of unsubscribers) {
                unsubscribe();
            }
        };
    });

    onDestroy(() => {
        clearCountdown();
        void manager?.disconnect();
        manager = null;
    });
</script>

<svelte:head>
    <title>Random 1v1 Video Chat</title>
    <meta
        name="description"
        content="Randomly match one online paid user for a 10-minute 1v1 video chat."
    />
</svelte:head>

<div class="random-chat-page">
    <header class="hero">
        <h1>Random 1v1 Video Chat</h1>
        <p>Only signed-in users can use this feature.</p>
    </header>

    {#if !clerkEnabled}
        <div class="notice error">Clerk is not enabled in this environment.</div>
    {:else if checkingEligibility}
        <div class="notice">Checking login and payment eligibility...</div>
    {:else if !signedIn}
        <div class="notice warn">
            <p>Please sign in first.</p>
            <button class="btn primary" on:click={handleSignIn}>Sign In</button>
        </div>
    {:else if !eligible}
        <div class="notice warn">
            {#if requirePaidOrder && !hasPaidOrder}
                <p>No paid order found. Please complete a payment first.</p>
                <a class="btn primary" href={`/${currentLang}/account`}>Go to Account</a>
            {:else}
                <p>You are not eligible to use random chat at the moment.</p>
            {/if}
        </div>
    {:else}
        <section class="status-card">
            <div class="row">
                <span>Signaling:</span>
                <strong>{connected ? "Connected" : "Not connected"}</strong>
            </div>
            <div class="row">
                <span>Matching:</span>
                <strong>{searching ? "Searching..." : inCall ? "In call" : "Idle"}</strong>
            </div>
            <div class="row">
                <span>Time left:</span>
                <strong>{countdown}</strong>
            </div>

            {#if errorMessage}
                <div class="notice error">{errorMessage}</div>
            {/if}

            {#if matchEndReason}
                <div class="notice">Last session ended: {matchEndReason}</div>
            {/if}

            <div class="actions">
                {#if inCall}
                    <button class="btn danger" on:click={leaveMatch}>Leave Call</button>
                {:else if searching}
                    <button class="btn" on:click={cancelMatching}>Cancel Matching</button>
                {:else}
                    <button class="btn primary" on:click={startMatching}>
                        Start Random Match
                    </button>
                {/if}
            </div>
        </section>

        <section class="video-grid">
            <div class="video-card">
                <h3>Your Camera</h3>
                <video bind:this={localVideoEl} autoplay playsinline muted></video>
            </div>
            <div class="video-card">
                <h3>Peer Camera</h3>
                <video bind:this={remoteVideoEl} autoplay playsinline></video>
            </div>
        </section>
    {/if}
</div>

<style>
    .random-chat-page {
        width: min(1100px, 95%);
        margin: 0 auto;
        padding: 24px 0 40px;
        display: grid;
        gap: 20px;
    }

    .hero {
        padding: 20px;
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(21, 131, 179, 0.18), rgba(6, 74, 120, 0.1));
        border: 1px solid rgba(120, 203, 238, 0.2);
    }

    .hero h1 {
        margin: 0 0 10px;
        font-size: 1.8rem;
    }

    .hero p {
        margin: 0;
        color: var(--subtext);
    }

    .status-card {
        display: grid;
        gap: 10px;
        padding: 18px;
        border-radius: 14px;
        border: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
    }

    .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .actions {
        display: flex;
        gap: 10px;
        margin-top: 10px;
    }

    .btn {
        border: 1px solid var(--button-primary-border);
        color: var(--button-primary-text);
        background: transparent;
        border-radius: 10px;
        padding: 8px 14px;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .btn.primary {
        background: var(--button-primary-bg);
        border-color: var(--button-primary-bg);
    }

    .btn.danger {
        border-color: #d44949;
        color: #d44949;
    }

    .video-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
    }

    .video-card {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
    }

    .video-card h3 {
        margin: 0;
        font-size: 0.95rem;
        color: var(--subtext);
    }

    .video-card video {
        width: 100%;
        aspect-ratio: 16/9;
        border-radius: 10px;
        background: #0b0b0b;
    }

    .notice {
        border-radius: 10px;
        padding: 10px 12px;
        border: 1px solid rgba(110, 158, 210, 0.3);
        background: rgba(110, 158, 210, 0.12);
    }

    .notice.warn {
        border-color: rgba(255, 177, 66, 0.4);
        background: rgba(255, 177, 66, 0.12);
    }

    .notice.error {
        border-color: rgba(228, 90, 90, 0.45);
        background: rgba(228, 90, 90, 0.14);
    }

    @media (max-width: 850px) {
        .video-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
