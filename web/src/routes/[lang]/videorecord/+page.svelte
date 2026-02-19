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

    // recording settings
    let showSettings = false;
    const aspectOptions = [
        { key: "16:9", label: "YouTube" },
        { key: "4:3", label: "经典" },
        { key: "3:4", label: "小红书" },
        { key: "9:16", label: "抖音" },
        { key: "1:1", label: "正方形" },
    ];
    let aspectRatio = "16:9";

    const bgColors = [
        "#111318",
        "#1b2430",
        "#2a1f36",
        "#123129",
        "#2b2d42",
        "#0b2f4b",
        "#2f1b1b",
        "#263238",
    ];
    let backgroundColor = bgColors[0];

    // cursor highlight
    let showCursorHighlight = true;
    let cursorHighlightColor = "#ff4d4f";
    let cursorHighlightSize = 20;
    let cursorInside = false;
    let cursorX = 0;
    let cursorY = 0;

    // teleprompter (DOM overlay only; not part of canvas stream)
    let teleprompterText = "把你的讲稿粘贴到这里，然后点击开始滚动。\n\n你可以一边看提词器，一边在白板上讲解。";
    let showTeleprompter = true;
    let isTeleprompterRunning = false;
    let teleprompterSpeed = 40; // px/s
    let teleprompterFontSize = 28;
    let teleprompterOpacity = 92;
    let teleprompterScrollTop = 0;
    let teleprompterLastTs = 0;
    let teleprompterRaf = 0;

    let teleprompterViewportEl: HTMLDivElement;
    let teleprompterContentEl: HTMLDivElement;

    // draggable teleprompter panel
    let teleprompterOffsetX = 0;
    let teleprompterOffsetY = 0;
    let draggingTeleprompter = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragBaseX = 0;
    let dragBaseY = 0;

    const ratioToNumber = (ratio: string) => {
        const [w, h] = ratio.split(":").map(Number);
        if (!w || !h) return 16 / 9;
        return w / h;
    };

    $: boardAspectRatio = ratioToNumber(aspectRatio);

    const fillCanvasBg = () => {
        if (!ctx || !canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);
    };

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

        fillCanvasBg();

        if (snapshot.width > 0 && snapshot.height > 0) {
            ctx.drawImage(snapshot, 0, 0, rect.width, rect.height);
        }
    };

    const triggerResizeNextFrame = () => {
        requestAnimationFrame(() => {
            resizeCanvas();
        });
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

    const updateCursorPosition = (e: PointerEvent) => {
        const p = getPoint(e);
        cursorX = p.x;
        cursorY = p.y;
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
        updateCursorPosition(e);
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

    const enterBoard = () => {
        cursorInside = true;
    };

    const leaveBoard = () => {
        cursorInside = false;
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
        fillCanvasBg();
    };

    const randomBackground = () => {
        const next = bgColors[Math.floor(Math.random() * bgColors.length)];
        backgroundColor = next;
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

    const startDragTeleprompter = (e: PointerEvent) => {
        draggingTeleprompter = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragBaseX = teleprompterOffsetX;
        dragBaseY = teleprompterOffsetY;
    };

    const onWindowPointerMove = (e: PointerEvent) => {
        if (!draggingTeleprompter) return;
        teleprompterOffsetX = dragBaseX + (e.clientX - dragStartX);
        teleprompterOffsetY = dragBaseY + (e.clientY - dragStartY);
    };

    const onWindowPointerUp = () => {
        draggingTeleprompter = false;
    };
</script>

<svelte:window on:pointermove={onWindowPointerMove} on:pointerup={onWindowPointerUp} />

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
        </div>
    </div>

    <div class="board-wrap" style={`aspect-ratio:${boardAspectRatio}; background:${backgroundColor};`}>
        <canvas
            bind:this={canvasEl}
            class="board"
            on:pointerenter={enterBoard}
            on:pointerdown={beginDraw}
            on:pointermove={draw}
            on:pointerup={endDraw}
            on:pointercancel={endDraw}
            on:pointerleave={(e) => { endDraw(e); leaveBoard(); }}
        />

        {#if showCursorHighlight && cursorInside && isRecording}
            <div
                class="cursor-highlight"
                style={`left:${cursorX}px; top:${cursorY}px; width:${cursorHighlightSize}px; height:${cursorHighlightSize}px; background:${cursorHighlightColor};`}
            ></div>
        {/if}

        <div class="floating-controls">
            <button class="floating-btn" on:click={() => (showSettings = true)}>⚙</button>
            <button class="floating-btn" class:active={showTeleprompter} on:click={() => (showTeleprompter = !showTeleprompter)}>📝</button>
            {#if !isRecording}
                <button class="floating-record" on:click={startRecord}>● 录制</button>
            {:else}
                <button class="floating-stop" on:click={stopRecord}>■ 停止 {formatDuration(recordDuration)}</button>
            {/if}
        </div>

        {#if showTeleprompter}
            <div
                class="teleprompter-panel"
                style={`opacity:${teleprompterOpacity / 100}; transform:translate(${teleprompterOffsetX}px, ${teleprompterOffsetY}px);`}
            >
                <div class="teleprompter-dragbar" on:pointerdown={startDragTeleprompter}>
                    <span>📝 提词器</span>
                    <small>拖动这里移动面板</small>
                </div>

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
                        透明度
                        <input type="range" min="20" max="100" step="2" bind:value={teleprompterOpacity} />
                        <span>{teleprompterOpacity}%</span>
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

{#if showSettings}
    <button class="modal-backdrop" aria-label="关闭录制设置" on:click={() => (showSettings = false)}></button>

    <div class="settings-modal" role="dialog" aria-label="录制设置">
        <div class="settings-header">
            <h3>录制设置</h3>
            <button on:click={() => (showSettings = false)}>✕</button>
        </div>

        <section>
            <div class="section-title">画面比例</div>
            <div class="ratio-grid">
                {#each aspectOptions as item}
                    <button
                        class:active={aspectRatio === item.key}
                        on:click={() => {
                            aspectRatio = item.key;
                            triggerResizeNextFrame();
                        }}
                    >
                        <strong>{item.key}</strong>
                        <small>{item.label}</small>
                    </button>
                {/each}
            </div>
        </section>

        <section>
            <div class="section-title">背景</div>
            <div class="bg-actions">
                <button on:click={randomBackground}>随机选择背景</button>
            </div>
            <div class="bg-grid">
                {#each bgColors as color}
                    <button
                        class="bg-swatch"
                        class:selected={backgroundColor === color}
                        style={`background:${color}`}
                        on:click={() => {
                            backgroundColor = color;
                            clearCanvas();
                        }}
                        aria-label={`背景 ${color}`}
                    ></button>
                {/each}
            </div>
        </section>

        <section>
            <div class="section-title">提词器透明度</div>
            <label class="slider-row">
                <input type="range" min="20" max="100" step="2" bind:value={teleprompterOpacity} />
                <span>{teleprompterOpacity}%</span>
            </label>
        </section>

        <section>
            <div class="section-title">鼠标光标效果</div>
            <label class="switch-row">
                <input type="checkbox" bind:checked={showCursorHighlight} />
                <span>录制时显示光标高亮</span>
            </label>
            <div class="cursor-settings">
                <input type="color" bind:value={cursorHighlightColor} disabled={!showCursorHighlight} />
                <label class="slider-row">
                    <input type="range" min="8" max="60" step="2" bind:value={cursorHighlightSize} disabled={!showCursorHighlight} />
                    <span>{cursorHighlightSize}px</span>
                </label>
            </div>
        </section>
    </div>
{/if}

<style>
    .page {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 1240px;
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
        height: auto;
        max-height: 78vh;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid var(--button);
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
        top: 64px;
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

    .teleprompter-dragbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(255,255,255,0.08);
        cursor: move;
        user-select: none;
    }

    .teleprompter-dragbar span {
        font-weight: 700;
        font-size: 13px;
    }

    .teleprompter-dragbar small {
        font-size: 11px;
        opacity: 0.75;
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

    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        border: 0;
        z-index: 8;
        border-radius: 0;
    }

    .settings-modal {
        position: fixed;
        z-index: 9;
        inset: 7vh auto auto 50%;
        transform: translateX(-50%);
        width: min(900px, calc(100vw - 28px));
        max-height: 84vh;
        overflow: auto;
        background: #f7f7f7;
        color: #1f1f1f;
        border-radius: 20px;
        padding: 16px;
        box-sizing: border-box;
        border: 1px solid rgba(0, 0, 0, 0.08);
    }

    .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .settings-header h3 {
        margin: 0;
        font-size: 26px;
    }

    .settings-header button {
        background: #ececec;
        color: #333;
    }

    section {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 1px solid #ddd;
    }

    .section-title {
        font-size: 14px;
        color: #666;
        margin-bottom: 10px;
    }

    .ratio-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }

    .ratio-grid button {
        background: #fff;
        color: #222;
        border: 1px solid #ddd;
        min-height: 64px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 2px;
    }

    .ratio-grid button.active {
        background: #232323;
        color: #fff;
        border-color: #232323;
    }

    .ratio-grid strong {
        font-size: 24px;
        line-height: 1;
    }

    .ratio-grid small {
        font-size: 12px;
        opacity: 0.8;
    }

    .bg-actions {
        margin-bottom: 10px;
    }

    .bg-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 8px;
    }

    .bg-swatch {
        border: 2px solid transparent;
        height: 44px;
        border-radius: 10px;
        padding: 0;
    }

    .bg-swatch.selected {
        border-color: #111;
    }

    .slider-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .slider-row input {
        flex: 1;
    }

    .cursor-highlight {
        position: absolute;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        pointer-events: none;
        opacity: 0.45;
        mix-blend-mode: screen;
        z-index: 3;
    }

    .floating-controls {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        gap: 8px;
        z-index: 4;
    }

    .floating-btn {
        background: rgba(255,255,255,0.92);
        color: #222;
        min-width: 40px;
        padding: 8px 10px;
    }

    .floating-record {
        background: #df2f35;
        color: #fff;
        font-weight: 700;
    }

    .floating-stop {
        background: #2d9d67;
        color: #fff;
        font-weight: 700;
    }

    .switch-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
    }

    .cursor-settings {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 10px;
    }

    @media (max-width: 900px) {
        .teleprompter-panel {
            width: calc(100% - 24px);
            min-width: 0;
        }

        .teleprompter-layout {
            grid-template-columns: 1fr;
        }

        .ratio-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .bg-grid {
            grid-template-columns: repeat(4, 1fr);
        }
    }
</style>
