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

    // teleprompter (DOM overlay only; not part of canvas stream)
    let teleprompterText = "把你的讲稿粘贴到这里，然后点击开始滚动。\n\n你可以一边看提词器，一边在白板上讲解。";
    let showTeleprompter = true;
    let isTeleprompterRunning = false;
    let teleprompterSpeed = 40; // px/s
    let teleprompterFontSize = 28;
    let teleprompterScrollTop = 0;
    let teleprompterLastTs = 0;
    let teleprompterRaf = 0;

    let teleprompterViewportEl: HTMLDivElement;
    let teleprompterContentEl: HTMLDivElement;

    const resizeCanvas = () => {
        if (!canvasEl || !ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvasEl.getBoundingClientRect();

        const snapshot = document.createElement("canvas");
        snapshot.width = canvasEl.width;
        snapshot.height = canvasEl.height;
        const snapCtx = snapshot.getContext("2d");
        if (snapCtx && canvasEl.width > 0 && canvasEl.height > 0) {
            snapCtx.drawImage(canvasEl, 0, 0);
        }

        canvasEl.width = Math.max(1, Math.floor(rect.width * dpr));
        canvasEl.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);

        if (snapshot.width > 0 && snapshot.height > 0) {
            ctx.drawImage(snapshot, 0, 0, rect.width, rect.height);
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
            if (teleprompterRaf) cancelAnimationFrame(teleprompterRaf);
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
        try {
            canvasEl.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
    };

    const clearCanvas = () => {
        if (!ctx || !canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);
    };

    const startRecord = async () => {
        if (isRecording) return;

        // only canvas stream is recorded; toolbar/teleprompter DOM won't be captured
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

    const resetTeleprompterPosition = () => {
        teleprompterScrollTop = 0;
        if (teleprompterViewportEl) teleprompterViewportEl.scrollTop = 0;
    };

    const stopTeleprompter = () => {
        isTeleprompterRunning = false;
        teleprompterLastTs = 0;
        if (teleprompterRaf) cancelAnimationFrame(teleprompterRaf);
        teleprompterRaf = 0;
    };

    const runTeleprompter = (ts: number) => {
        if (!isTeleprompterRunning || !teleprompterViewportEl || !teleprompterContentEl) return;

        if (!teleprompterLastTs) teleprompterLastTs = ts;
        const dt = (ts - teleprompterLastTs) / 1000;
        teleprompterLastTs = ts;

        teleprompterScrollTop += teleprompterSpeed * dt;

        const maxScroll = Math.max(
            0,
            teleprompterContentEl.scrollHeight - teleprompterViewportEl.clientHeight,
        );

        if (teleprompterScrollTop >= maxScroll) {
            teleprompterScrollTop = maxScroll;
            teleprompterViewportEl.scrollTop = teleprompterScrollTop;
            stopTeleprompter();
            return;
        }

        teleprompterViewportEl.scrollTop = teleprompterScrollTop;
        teleprompterRaf = requestAnimationFrame(runTeleprompter);
    };

    const startTeleprompter = () => {
        if (!showTeleprompter || isTeleprompterRunning) return;
        isTeleprompterRunning = true;
        teleprompterLastTs = 0;
        teleprompterRaf = requestAnimationFrame(runTeleprompter);
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

            <button class:active={showTeleprompter} on:click={() => (showTeleprompter = !showTeleprompter)}>
                {showTeleprompter ? "隐藏提词器" : "显示提词器"}
            </button>

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

        {#if showTeleprompter}
            <div class="teleprompter-panel">
                <div class="teleprompter-controls">
                    <button on:click={startTeleprompter} disabled={isTeleprompterRunning}>开始滚动</button>
                    <button on:click={stopTeleprompter} disabled={!isTeleprompterRunning}>暂停</button>
                    <button on:click={resetTeleprompterPosition}>重置</button>

                    <label>
                        速度
                        <input type="range" min="10" max="180" step="5" bind:value={teleprompterSpeed} />
                        <span>{teleprompterSpeed}px/s</span>
                    </label>

                    <label>
                        字号
                        <input type="range" min="16" max="52" step="2" bind:value={teleprompterFontSize} />
                        <span>{teleprompterFontSize}px</span>
                    </label>
                </div>

                <div class="teleprompter-layout">
                    <textarea
                        bind:value={teleprompterText}
                        placeholder="在这里输入提词内容..."
                        on:input={() => {
                            stopTeleprompter();
                            resetTeleprompterPosition();
                        }}
                    />

                    <div class="teleprompter-preview" bind:this={teleprompterViewportEl}>
                        <div
                            bind:this={teleprompterContentEl}
                            class="teleprompter-content"
                            style={`font-size:${teleprompterFontSize}px`}
                        >
                            {teleprompterText}
                        </div>
                    </div>
                </div>

                <div class="teleprompter-note">提词器是页面浮层，不在录制的 canvas 里，因此不会出现在导出视频中。</div>
            </div>
        {/if}
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

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
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
        position: relative;
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

    .teleprompter-panel {
        position: absolute;
        top: 12px;
        right: 12px;
        width: min(44%, 520px);
        min-width: 320px;
        max-height: calc(100% - 24px);
        overflow: auto;
        background: rgba(8, 9, 12, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 10px;
        backdrop-filter: blur(6px);
        z-index: 2;
    }

    .teleprompter-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
    }

    .teleprompter-controls label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--subtext);
    }

    .teleprompter-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        min-height: 260px;
    }

    textarea {
        width: 100%;
        min-height: 260px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.04);
        color: var(--text);
        padding: 10px;
        resize: vertical;
        box-sizing: border-box;
        outline: none;
    }

    .teleprompter-preview {
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(0, 0, 0, 0.45);
        overflow: auto;
        padding: 14px 12px;
        box-sizing: border-box;
    }

    .teleprompter-content {
        white-space: pre-wrap;
        line-height: 1.7;
        font-weight: 700;
        color: #f3f7ff;
    }

    .teleprompter-note {
        margin-top: 8px;
        font-size: 12px;
        opacity: 0.75;
    }

    .hint {
        font-size: 13px;
        opacity: 0.75;
        text-align: center;
    }

    @media (max-width: 900px) {
        .teleprompter-panel {
            width: calc(100% - 24px);
            min-width: 0;
        }

        .teleprompter-layout {
            grid-template-columns: 1fr;
        }
    }
</style>
