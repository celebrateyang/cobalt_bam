<script lang="ts">
    import { tick } from "svelte";
    import { killDialog } from "$lib/state/dialogs";

    import DialogBackdropClose from "$components/dialog/DialogBackdropClose.svelte";

    export let id: string;
    export let dismissable = true;
    export let managedCancel = false;
    export let ariaLabel: string | undefined = undefined;

    let dialogParent: HTMLDialogElement;

    let open = false;
    let closing = false;

    export const close = () => {
        if (!dialogParent) return;

        closing = true;
        open = false;
        setTimeout(() => {
            if (dialogParent) {
                dialogParent.close();
            }
            killDialog(id);
        }, 150);
    };

    $: if (dialogParent) {
        dialogParent.showModal();
        tick().then(() => {
            open = true;
        });
    }
</script>

<dialog id="dialog-{id}" aria-label={ariaLabel} bind:this={dialogParent} class:closing class:open
    on:cancel={(event) => {
        if (managedCancel) {
            event.preventDefault();
            if (dismissable) close();
        }
    }}>
    <slot></slot>
    <DialogBackdropClose closeFunc={dismissable ? close : () => {}} />
</dialog>
