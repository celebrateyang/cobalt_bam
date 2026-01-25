import type { CobaltWorkerProgress } from "$lib/types/workers";
import type { UUID } from "$lib/types/queue";

export type CobaltCurrentTaskItem = {
    type: "fetch" | "encode" | "remux";
    parentId: UUID;
    progress?: CobaltWorkerProgress;
};

export type CobaltCurrentTasks = Record<UUID, CobaltCurrentTaskItem>;
