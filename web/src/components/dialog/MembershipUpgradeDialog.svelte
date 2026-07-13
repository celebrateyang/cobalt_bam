<script lang="ts">
    import { goto } from "$app/navigation";
    import { t } from "$lib/i18n/translations";
    import { membershipAccountPath } from "$lib/membership/gate";
    import { signIn } from "$lib/state/clerk";
    import type {
        MembershipEligibilityReason,
        MembershipFeature,
    } from "$lib/api/membership";

    import DialogContainer from "$components/dialog/DialogContainer.svelte";
    import IconCrown from "@tabler/icons-svelte/IconCrown.svelte";
    import IconCheck from "@tabler/icons-svelte/IconCheck.svelte";

    export let id: string;
    export let dismissable = true;
    export let feature: MembershipFeature;
    export let reason: MembershipEligibilityReason = "MEMBERSHIP_REQUIRED";
    export let returnPath: string | null = null;

    let close: () => void;

    $: featureLabel = $t(`membership-gate.feature.${feature}`);
    $: reasonKey =
        reason === "ENTITLEMENT_MISSING"
            ? "membership-gate.reason.entitlement_missing"
            : "membership-gate.reason.membership_required";
    $: usageNoteKey =
        feature === "ai_video_studio"
            ? "membership-gate.note.ai_video_studio"
            : "membership-gate.note.unmetered";

    const openSignIn = async () => {
        close();
        await signIn({
            fallbackRedirectUrl: returnPath || undefined,
            signInFallbackRedirectUrl: returnPath || undefined,
        });
    };

    const openMembership = async () => {
        close();
        await goto(membershipAccountPath(returnPath));
    };
</script>

<DialogContainer {id} {dismissable} bind:close>
    <div class="dialog-body membership-upgrade-dialog">
        <div class="crown"><IconCrown size={34} stroke={1.8} /></div>
        <div class="eyebrow">{$t("membership-gate.eyebrow")}</div>
        <h2>{$t("membership-gate.title", { feature: featureLabel })}</h2>
        <p class="summary">{$t(reasonKey)}</p>

        <div class="benefits">
            <div class="benefit">
                <IconCheck size={19} />
                <span>{$t("membership-gate.benefit.ai_video_studio")}</span>
            </div>
            <div class="benefit">
                <IconCheck size={19} />
                <span>{$t("membership-gate.benefit.video_recording")}</span>
            </div>
            <div class="benefit">
                <IconCheck size={19} />
                <span>{$t("membership-gate.benefit.random_chat")}</span>
            </div>
        </div>

        <p class="usage-note">{$t(usageNoteKey)}</p>

        <div class="actions">
            <button class="button elevated" on:click={close}>
                {$t("membership-gate.action.not_now")}
            </button>
            {#if reason === "SIGN_IN_REQUIRED"}
                <button class="button elevated active" on:click={openSignIn}>
                    {$t("membership-gate.action.sign_in")}
                </button>
            {:else}
                <button class="button elevated active" on:click={openMembership}>
                    {$t("membership-gate.action.view_membership")}
                </button>
            {/if}
        </div>
    </div>
</DialogContainer>

<style>
    .membership-upgrade-dialog {
        width: min(460px, calc(100vw - 32px));
        align-items: stretch;
        gap: 14px;
        text-align: center;
        overflow: hidden;
    }

    .crown {
        width: 64px;
        height: 64px;
        margin: 0 auto -4px;
        display: grid;
        place-items: center;
        border-radius: 22px;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 14%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
    }

    .eyebrow {
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 750;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    h2,
    p {
        margin: 0;
    }

    h2 {
        font-size: 1.45rem;
        line-height: 1.2;
    }

    .summary,
    .usage-note {
        color: var(--subtext);
        line-height: 1.5;
    }

    .benefits {
        display: grid;
        gap: 9px;
        padding: 14px;
        text-align: start;
        border-radius: 17px;
        background: color-mix(in srgb, var(--accent) 7%, var(--popup-bg));
    }

    .benefit {
        display: flex;
        align-items: center;
        gap: 9px;
        line-height: 1.35;
    }

    .benefit :global(svg) {
        flex: 0 0 auto;
        color: var(--accent);
    }

    .usage-note {
        font-size: 0.88rem;
    }

    .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }

    .actions button {
        min-height: 44px;
        white-space: normal;
    }

    @media screen and (max-width: 535px) {
        .membership-upgrade-dialog {
            width: calc(100vw - 24px);
        }
    }
</style>
