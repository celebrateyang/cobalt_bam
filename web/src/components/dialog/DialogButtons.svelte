<script lang="ts">
    import type { DialogButton as DialogButtonType } from "$lib/types/dialog";
    import DialogButton from "$components/dialog/DialogButton.svelte";

    export let buttons: DialogButtonType[];
    export let closeFunc: () => void;
</script>

<div class="popup-buttons">
    {#each buttons as button}
        {#if button.description}
            <div class="described-button">
                <DialogButton {button} {closeFunc} />
                <p class="button-description">{button.description}</p>
            </div>
        {:else}
            <DialogButton {button} {closeFunc} />
        {/if}
    {/each}
</div>

<style>
    .described-button {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }

    .button-description {
        margin: 0;
        font-size: 0.8rem;
        line-height: 1.4;
        text-align: center;
        overflow-wrap: anywhere;
        opacity: 0.8;
    }

    .popup-buttons {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
        width: 100%;
        gap: calc(var(--padding) / 2);
        overflow: visible;
        min-height: 40px;
    }
</style>
