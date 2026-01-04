import type { CobaltFileUrlType } from "$lib/types/api";
import type { MeowbaltEmotions } from "$lib/types/meowbalt";

export type DialogButton = {
    text: string,
    color?: "red",
    main: boolean,
    timeout?: number, // milliseconds
    action: () => unknown | Promise<unknown>
}

export type SmallDialogIcons = "warn-red";

export type DialogPickerItem = {
    type?: 'photo' | 'video' | 'gif',
    url: string,
    thumb?: string,
}

export type DialogBatchItem = {
    url: string,
    title?: string,
    duration?: number,
    itemKey?: string,
};

type Dialog = {
    id: string,
    dismissable?: boolean,
};

type SmallDialog = Dialog & {
    type: "small",
    meowbalt?: MeowbaltEmotions,
    icon?: SmallDialogIcons,
    title?: string,
    bodyText?: string,
    bodyHtml?: string,
    bodySubText?: string,
    buttons?: DialogButton[],
    leftAligned?: boolean,
};

type PickerDialog = Dialog & {
    type: "picker",
    items?: DialogPickerItem[],
    buttons?: DialogButton[],
};

type SavingDialog = Dialog & {
    type: "saving",
    bodyText?: string,
    url?: string,
    file?: File,
    urlType?: CobaltFileUrlType,
};

type BatchDialog = Dialog & {
    type: "batch",
    title?: string,
    items: DialogBatchItem[],
    downloadedItems?: DialogBatchItem[],
    collectionTotalCount?: number,
    collectionKey?: string,
    collectionSourceUrl?: string,
};

type FeedbackDialog = Dialog & {
    type: "feedback",
    title?: string,
    initialVideoUrl?: string,
};

export type DialogInfo = SmallDialog | PickerDialog | SavingDialog | BatchDialog | FeedbackDialog;
