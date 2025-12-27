import { readable, type Updater } from "svelte/store";
import type { DialogInfo } from "$lib/types/dialog";

let update: (_: Updater<DialogInfo[]>) => void;

export default readable<DialogInfo[]>(
    [],
    (_, _update) => { update = _update }
);

export function createDialog(newData: DialogInfo) {
    update((popups) => {
        const next = popups.filter((popup) => popup.id !== newData.id);
        next.push(newData);
        return next;
    });
}

export function killDialog(id?: string) {
    update((popups) => {
        if (!id) {
            popups.pop();
            return popups;
        }

        for (let i = popups.length - 1; i >= 0; i--) {
            if (popups[i]?.id === id) {
                popups.splice(i, 1);
                break;
            }
        }
        return popups;
    });
}
