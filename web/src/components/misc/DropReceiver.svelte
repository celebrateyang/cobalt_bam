<script lang="ts">
    export let id: string;
    export let classes = "";

    export let draggedOver = false;
    export let file: File | undefined;
    export let files: File[] | undefined;
    export let multiple = false;

    const dropHandler = async (ev: DragEvent) => {
        draggedOver = false;
        ev.preventDefault();

        const droppedFiles = ev?.dataTransfer?.files;
        if (!droppedFiles || droppedFiles.length === 0) return;

        if (multiple) {
            files = Array.from(droppedFiles);
            file = files[0];
            return files;
        }

        if (droppedFiles.length === 1) {
            file = droppedFiles[0];
            files = [file];
            return file;
        }
    };

    const dragOverHandler = (ev: DragEvent) => {
        draggedOver = true;
        ev.preventDefault();
    };
</script>

<div
    {id}
    class={classes}
    role="region"
    on:drop={(ev) => dropHandler(ev)}
    on:dragover={(ev) => dragOverHandler(ev)}
    on:dragend={() => {
        draggedOver = false;
    }}
    on:dragleave={() => {
        draggedOver = false;
    }}
>
    <slot></slot>
</div>
