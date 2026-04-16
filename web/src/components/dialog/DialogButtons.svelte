<script lang="ts">
    import type { DialogButton as DialogButtonType } from "$lib/types/dialog";
    import DialogButton from "$components/dialog/DialogButton.svelte";

    export let buttons: DialogButtonType[];
    export let closeFunc: () => void;
</script>

<div class="popup-buttons">
    {#each buttons as button}
        <DialogButton {button} {closeFunc} />
    {/each}
</div>

<style>
    .popup-buttons {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
        width: 100%;
        gap: calc(var(--padding) / 2);
        overflow: visible;
        min-height: 40px;
    }
</style>
