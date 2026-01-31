<script lang="ts">
    import { get } from "svelte/store";
    import { t } from "$lib/i18n/translations";
    import { currentApiURL } from "$lib/api/api-url";
    import { getClerkToken } from "$lib/state/clerk";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";

    export let id: string;
    export let title = "";
    export let initialVideoUrl = "";
    export let dismissable = true;

    let close: () => void;

    let videoUrl = initialVideoUrl;
    let phenomenon = "";
    let suggestion = "";
    let loading = false;
    let error = "";
    let submitted = false;

    const validate = () => {
        const nextVideoUrl = videoUrl.trim();
        const nextPhenomenon = phenomenon.trim();

        if (!nextVideoUrl) {
            error = get(t)("dialog.feedback.error.video_required");
            return null;
        }

        if (!nextPhenomenon) {
            error = get(t)("dialog.feedback.error.phenomenon_required");
            return null;
        }

        if (nextVideoUrl.length > 2048) {
            error = get(t)("dialog.feedback.error.video_too_long");
            return null;
        }

        if (nextPhenomenon.length > 8000) {
            error = get(t)("dialog.feedback.error.phenomenon_too_long");
            return null;
        }

        const nextSuggestion = suggestion.trim();
        if (nextSuggestion.length > 8000) {
            error = get(t)("dialog.feedback.error.suggestion_too_long");
            return null;
        }

        error = "";
        return {
            videoUrl: nextVideoUrl,
            phenomenon: nextPhenomenon,
            suggestion: nextSuggestion || null,
        };
    };

    const submit = async () => {
        if (loading) return;
        submitted = false;

        const payload = validate();
        if (!payload) return;

        loading = true;
        try {
            const token = await getClerkToken();
            if (!token) {
                throw new Error(get(t)("dialog.feedback.error.not_signed_in"));
            }

            const apiBase = currentApiURL();
            const res = await fetch(`${apiBase}/user/feedback`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                throw new Error(
                    data?.error?.message ||
                        get(t)("dialog.feedback.error.submit_failed"),
                );
            }

            submitted = true;
            setTimeout(() => close?.(), 350);
        } catch (e) {
            error =
                e instanceof Error
                    ? e.message
                    : get(t)("dialog.feedback.error.submit_failed");
        } finally {
            loading = false;
        }
    };
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body feedback-dialog">
        <div class="header">
            <h2 class="title" tabindex="-1">
                {title || $t("dialog.feedback.title")}
            </h2>
            <p class="subtitle">{$t("dialog.feedback.subtitle")}</p>
        </div>

        <form class="form" on:submit|preventDefault={submit}>
            <label class="field">
                <span class="label">{$t("dialog.feedback.fields.video_url")}</span>
                <input
                    type="url"
                    inputmode="url"
                    bind:value={videoUrl}
                    placeholder={$t("dialog.feedback.placeholder.video_url")}
                    disabled={loading}
                    autocomplete="off"
                />
            </label>

            <label class="field">
                <span class="label">{$t("dialog.feedback.fields.phenomenon")}</span>
                <textarea
                    rows="4"
                    bind:value={phenomenon}
                    placeholder={$t("dialog.feedback.placeholder.phenomenon")}
                    disabled={loading}
                />
            </label>

            <div class="field wechat-contact">
                <span class="label">{$t("dialog.feedback.wechat.title")}</span>
                <div class="wechat-card">
                    <img
                        class="wechat-qr"
                        src="/account/wechat.png"
                        alt={$t("dialog.feedback.wechat.alt")}
                        loading="lazy"
                    />
                </div>
                <p class="wechat-hint">{$t("dialog.feedback.wechat.hint")}</p>
            </div>

            {#if error}
                <div class="message error" role="alert">{error}</div>
            {:else if submitted}
                <div class="message success" role="status">
                    {$t("dialog.feedback.success")}
                </div>
            {/if}

            <div class="actions">
                <button
                    type="button"
                    class="button elevated"
                    disabled={loading}
                    on:click={() => close?.()}
                >
                    {$t("button.cancel")}
                </button>
                <button
                    type="submit"
                    class="button elevated active"
                    disabled={loading}
                >
                    {loading
                        ? $t("dialog.feedback.submitting")
                        : $t("dialog.feedback.submit")}
                </button>
            </div>
        </form>
    </div>
</DialogContainer>

<style>
    .feedback-dialog {
        display: flex;
        flex-direction: column;
        gap: var(--padding);
        width: calc(100% - var(--padding) - var(--dialog-padding) * 2);
        max-width: 560px;
        max-height: 85%;
        margin: calc(var(--padding) / 2);
    }

    .header {
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-align: left;
        width: 100%;
    }

    .title {
        margin: 0;
        color: var(--secondary);
        font-size: 19px;
    }

    .subtitle {
        margin: 0;
        color: var(--gray);
        font-size: 13px;
        line-height: 1.4;
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        overflow-y: auto;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 8px;
        text-align: left;
    }

    .label {
        font-size: 13px;
        font-weight: 600;
        color: var(--secondary);
    }

    input,
    textarea {
        width: 100%;
        padding: 13px 16px;
        border: none;
        border-radius: var(--border-radius);
        font-size: 0.95rem;
        background: var(--button);
        color: var(--button-text);
        box-sizing: border-box;
        box-shadow: var(--button-box-shadow);
        transition: all 0.2s;
        font-family: "IBM Plex Mono", monospace;
        user-select: text;
        -webkit-user-select: text;
    }

    textarea {
        resize: vertical;
        min-height: 96px;
    }

    .wechat-contact {
        gap: 10px;
    }

    .wechat-card {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        border-radius: var(--border-radius);
        background: var(--button);
        box-shadow: var(--button-box-shadow);
    }

    .wechat-qr {
        width: 168px;
        height: 168px;
        object-fit: contain;
    }

    .wechat-hint {
        margin: 0;
        font-size: 12px;
        color: var(--gray);
    }

    input:focus,
    textarea:focus {
        outline: none;
        background: var(--button-hover);
        box-shadow: 0 0 0 2px var(--blue) inset;
    }

    input::placeholder,
    textarea::placeholder {
        color: var(--gray);
        opacity: 0.6;
    }

    input:disabled,
    textarea:disabled {
        opacity: 0.65;
        cursor: not-allowed;
    }

    .message {
        width: 100%;
        padding: calc(var(--padding) - 2px);
        border-radius: var(--border-radius);
        font-size: 0.85rem;
        font-weight: 500;
    }

    .message.error {
        background: var(--red);
        color: var(--white);
    }

    .message.success {
        background: var(--green);
        color: var(--white);
    }

    .actions {
        display: flex;
        gap: calc(var(--padding) / 2);
        width: 100%;
        min-height: 40px;
    }

    .actions button {
        width: 100%;
        height: 40px;
    }
</style>

