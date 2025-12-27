<script lang="ts">
    import { tick } from "svelte";
    import { killDialog } from "$lib/state/dialogs";

    import DialogBackdropClose from "$components/dialog/DialogBackdropClose.svelte";

    export let id: string;
    export let dismissable = true;

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

<dialog id="dialog-{id}" bind:this={dialogParent} class:closing class:open>
    <slot></slot>
    <DialogBackdropClose closeFunc={dismissable ? close : () => {}} />
</dialog>
