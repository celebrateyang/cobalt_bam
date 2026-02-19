<script lang="ts">
    import { onMount } from "svelte";

    let canvasEl: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null = null;

    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    let strokeColor = "#ffffff";
    let strokeWidth = 4;
    let tool: "pen" | "eraser" = "pen";

    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let isRecording = false;
    let recordDuration = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const backgroundColor = "#111318";

    const resizeCanvas = () => {
        if (!canvasEl || !ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvasEl.getBoundingClientRect();
        const oldImage = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);

        canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
        canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);

        if (oldImage.width > 0 && oldImage.height > 0) {
            const tmp = document.createElement("canvas");
            tmp.width = oldImage.width;
            tmp.height = oldImage.height;
            const tmpCtx = tmp.getContext("2d");
            if (tmpCtx) {
                tmpCtx.putImageData(oldImage, 0, 0);
                ctx.drawImage(tmp, 0, 0, rect.width, rect.height);
            }
        }
    };

    onMount(() => {
        ctx = canvasEl.getContext("2d");
        if (!ctx) return;

        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        return () => {
            window.removeEventListener("resize", resizeCanvas);
            if (timer) clearInterval(timer);
            recorder?.stop();
        };
    });

    const getPoint = (e: PointerEvent) => {
        const rect = canvasEl.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const beginDraw = (e: PointerEvent) => {
        if (!ctx) return;

        drawing = true;
        const p = getPoint(e);
        lastX = p.x;
        lastY = p.y;

        canvasEl.setPointerCapture(e.pointerId);
    };

    const draw = (e: PointerEvent) => {
        if (!drawing || !ctx) return;

        const p = getPoint(e);

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(p.x, p.y);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = tool === "eraser" ? backgroundColor : strokeColor;
        ctx.stroke();

        lastX = p.x;
        lastY = p.y;
    };

    const endDraw = (e: PointerEvent) => {
        drawing = false;
        canvasEl.releasePointerCapture(e.pointerId);
    };

    const clearCanvas = () => {
        if (!ctx || !canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);
    };

    const startRecord = async () => {
        if (isRecording) return;

        const stream = canvasEl.captureStream(60);
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ? "video/webm;codecs=vp9"
            : "video/webm";

        chunks = [];
        recorder = new MediaRecorder(stream, { mimeType: mime });

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            isRecording = false;

            if (!chunks.length) return;
            const blob = new Blob(chunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `videorecord-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
        };

        recorder.start(300);
        isRecording = true;
        recordDuration = 0;
        timer = setInterval(() => {
            recordDuration += 1;
        }, 1000);
    };

    const stopRecord = () => {
        if (!recorder || recorder.state === "inactive") return;
        recorder.stop();
    };

    const formatDuration = (sec: number) => {
        const m = String(Math.floor(sec / 60)).padStart(2, "0");
        const s = String(sec % 60).padStart(2, "0");
        return `${m}:${s}`;
    };
</script>

<svelte:head>
    <title>Video Record Whiteboard</title>
</svelte:head>

<div class="page">
    <div class="toolbar">
        <div class="left">
            <button class:active={tool === "pen"} on:click={() => (tool = "pen")}>画笔</button>
            <button class:active={tool === "eraser"} on:click={() => (tool = "eraser")}>橡皮</button>

            <input type="color" bind:value={strokeColor} disabled={tool === "eraser"} />
            <input type="range" min="1" max="24" bind:value={strokeWidth} />
            <span>{strokeWidth}px</span>
        </div>

        <div class="right">
            <button on:click={clearCanvas}>清空</button>

            {#if !isRecording}
                <button class="record" on:click={startRecord}>开始录制</button>
            {:else}
                <button class="stop" on:click={stopRecord}>停止录制 ({formatDuration(recordDuration)})</button>
            {/if}
        </div>
    </div>

    <div class="board-wrap">
        <canvas
            bind:this={canvasEl}
            class="board"
            on:pointerdown={beginDraw}
            on:pointermove={draw}
            on:pointerup={endDraw}
            on:pointercancel={endDraw}
            on:pointerleave={endDraw}
        />
    </div>

    <p class="hint">提示：停止录制后会自动下载 webm 视频。</p>
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 1100px;
        margin: 0 auto;
        padding: 10px;
        box-sizing: border-box;
    }

    .toolbar {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        background: var(--button);
        border-radius: 12px;
        padding: 10px;
    }

    .left,
    .right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    button {
        border: 0;
        border-radius: 10px;
        padding: 8px 12px;
        background: var(--sidebar-bg);
        color: var(--text);
        cursor: pointer;
    }

    button.active {
        background: var(--accent);
        color: #fff;
    }

    button.record {
        background: #d94343;
        color: #fff;
    }

    button.stop {
        background: #3a8f62;
        color: #fff;
    }

    .board-wrap {
        width: 100%;
        height: min(72vh, 760px);
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid var(--button);
        background: #111318;
    }

    .board {
        width: 100%;
        height: 100%;
        touch-action: none;
        display: block;
        cursor: crosshair;
    }

    .hint {
        font-size: 13px;
        opacity: 0.75;
        text-align: center;
    }
</style>
