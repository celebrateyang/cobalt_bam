<script lang="ts">
    import { onMount } from "svelte";
    import "@excalidraw/excalidraw/index.css";

    let canvasEl: HTMLCanvasElement;
    let boardWrapEl: HTMLDivElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

    let useExcalidrawBridge = true;
    let excalidrawHostEl: HTMLDivElement | null = null;
    let cleanupExcalidraw: (() => void) | null = null;
    let excalidrawMountToken = 0;
    let excalidrawMounted = false;
    let excalidrawApi: any = null;
    let bridgeAppStateGuard = false;
    const excalidrawSessionName = `videorecord-bridge-${Date.now()}`;

    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    let strokeColor = "#111111";
    let strokeWidth = 4;
    let tool:
        | "select"
        | "pen"
        | "eraser"
        | "text"
        | "line"
        | "rect"
        | "circle"
        | "laser"
        | "frame"
        | "webembed" = "pen";

    // text tool
    let textFontSize = 28;
    let textEditing = false;
    let textInputX = 0;
    let textInputY = 0;
    let textInputValue = "";
    let textAreaEl: HTMLTextAreaElement | null = null;
    let imageInputEl: HTMLInputElement | null = null;

    // shape tools
    let shapeStartX = 0;
    let shapeStartY = 0;
    let shapeSnapshot: ImageData | null = null;

    let showMoreTools = false;
    let laserPressed = false;
    let laserColor = "#ff3b30";
    let laserSize = 22;

    type WebEmbedItem = {
        id: string;
        url: string;
        x: number;
        y: number;
        w: number;
        h: number;
        locked?: boolean;
        hidden?: boolean;
        opacity?: number;
        flipX?: boolean;
        flipY?: boolean;
    };

    type FrameItem = {
        id: string;
        title: string;
        x: number;
        y: number;
        w: number;
        h: number;
        locked?: boolean;
        hidden?: boolean;
        opacity?: number;
        flipX?: boolean;
        flipY?: boolean;
    };

    type BridgeSlideScene = {
        elements: any[];
        appState: Record<string, unknown>;
        files: Record<string, unknown>;
    };

    type ProjectSnapshot = {
        version: 2;
        slides: string[];
        bridgeSlides?: BridgeSlideScene[];
        activeSlide: number;
        frames: FrameItem[];
        webEmbeds: WebEmbedItem[];
        settings: {
            aspectRatio: string;
            backgroundColor: string;
            canvasCornerRadius: number;
            canvasInnerPadding: number;
        };
    };
    let webEmbeds: WebEmbedItem[] = [];
    let draggingEmbedId: string | null = null;
    let resizingEmbedId: string | null = null;
    let selectedEmbedId: string | null = null;
    let selectedEmbedIds: string[] = [];
    let copiedFrames: FrameItem[] = [];
    let copiedEmbeds: WebEmbedItem[] = [];
    let embedDragOffsetX = 0;
    let embedDragOffsetY = 0;
    let embedResizeStartX = 0;
    let embedResizeStartY = 0;
    let embedResizeStartW = 0;
    let embedResizeStartH = 0;

    let frames: FrameItem[] = [];
    let draftingFrame = false;
    let draftFrameX = 0;
    let draftFrameY = 0;
    let draftFrameW = 0;
    let draftFrameH = 0;
    let draggingFrameId: string | null = null;
    let resizingFrameId: string | null = null;
    let selectedFrameId: string | null = null;
    let selectedFrameIds: string[] = [];
    let marqueeSelecting = false;
    let marqueeAdditive = false;
    let slideDragCandidate = false;
    let slideDragging = false;
    let slideDragStartX = 0;
    let slideDragStartY = 0;
    let slideDragCurrentX = 0;
    let marqueeX = 0;
    let marqueeY = 0;
    let marqueeW = 0;
    let marqueeH = 0;
    let marqueeStartX = 0;
    let marqueeStartY = 0;
    let frameDragOffsetX = 0;
    let frameDragOffsetY = 0;
    let frameResizeStartX = 0;
    let frameResizeStartY = 0;
    let frameResizeStartW = 0;
    let frameResizeStartH = 0;

    const clampToViewport = (x: number, y: number, w: number, h: number) => {
        if (typeof window === "undefined") return { x, y };
        const pad = 8;
        const maxX = Math.max(pad, window.innerWidth - w - pad);
        const maxY = Math.max(pad, window.innerHeight - h - pad);
        return {
            x: Math.min(maxX, Math.max(pad, x)),
            y: Math.min(maxY, Math.max(pad, y)),
        };
    };

    const snapValue = (value: number, target: number, threshold = 12) =>
        Math.abs(value - target) <= threshold ? target : value;

    let showGuideV = false;
    let showGuideH = false;
    let guideVX = 0;
    let guideHY = 0;

    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let isRecording = false;
    let isRecordingStarting = false;
    let isRecordingStopping = false;
    let recordDuration = 0;
    let recorderStopTimer: ReturnType<typeof setTimeout> | null = null;
    let stopHandled = false;
    let lastChunkAt = 0;
    let recordingStopCause:
        | "user"
        | "pagehide"
        | "video-ended"
        | "recorder-error"
        | "timeout"
        | "unknown" = "unknown";
    let isRecordPaused = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    // slides (basic multi-page)
    let slides: string[] = [""];
    let bridgeSlides: BridgeSlideScene[] = [
        { elements: [], appState: {}, files: {} },
    ];
    let activeSlide = 0;
    let draggingSlideIndex: number | null = null;

    let undoStack: string[] = [];
    let redoStack: string[] = [];

    // recording settings
    let showSettings = false;
    let exportFormat: "webm" | "mp4" = "mp4";
    let selectedMimeType = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
    let lastProjectSaveAt = 0;
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
    let autosaveSignature = "";
    let exportNotice = "";
    let exportNoticeLevel: "info" | "warn" | "error" = "info";
    let lastPreflightAt = 0;
    let showShortcutsHelp = false;
    const aspectOptions = [
        { key: "16:9", label: "YouTube" },
        { key: "4:3", label: "经典" },
        { key: "3:4", label: "小红书" },
        { key: "9:16", label: "抖音" },
        { key: "1:1", label: "正方形" },
    ];
    let aspectRatio = "16:9";

    const bgColors = [
        "#ffffff",
        "#f8fafc",
        "#f5f5f4",
        "#fff7ed",
        "#fefce8",
        "#ecfeff",
        "#f0f9ff",
        "#f5f3ff",
    ];
    let backgroundColor = bgColors[0];
    let canvasCornerRadius = 16;
    let canvasInnerPadding = 0;

    // camera overlay in recording
    let showCameraInRecord = true;
    let cameraSize = 180;
    let cameraRadius = 16;
    let cameraMargin = 24;
    let cameraCorner: "br" | "bl" | "tr" | "tl" = "br";
    let cameraMirror = true;
    let cameraOffsetX = 0;
    let cameraOffsetY = 0;
    let cameraStream: MediaStream | null = null;
    let cameraVideoEl: HTMLVideoElement | null = null;
    let cameraRenderRaf = 0;
    let cameraPreviewEl: HTMLVideoElement | null = null;
    let showCameraPreview = false;
    let bridgeCompositeCanvas: HTMLCanvasElement | null = null;
    let bridgeCompositeCtx: CanvasRenderingContext2D | null = null;
    let bridgeCompositeRaf = 0;
    let draggingCameraOverlay = false;
    let cameraDragStartX = 0;
    let cameraDragStartY = 0;
    let cameraDragBaseX = 0;
    let cameraDragBaseY = 0;
    let cameraDragSurfaceW = 0;
    let cameraDragSurfaceH = 0;
    let cameraDragSize = 0;

    let includeMicAudio = true;
    let enableRecordCountdown = true;
    let recordCountdownSeconds = 3;
    let recordCountdownLeft = 0;
    let micDevices: MediaDeviceInfo[] = [];
    let selectedMicDeviceId = "";
    let micStream: MediaStream | null = null;
    let micAudioCtx: AudioContext | null = null;
    let micDest: MediaStreamAudioDestinationNode | null = null;
    let micLevel = 0;
    let micTestRunning = false;
    let micLevelRaf = 0;

    // cursor highlight
    let showCursorHighlight = true;
    let cursorHighlightColor = "#ff4d4f";
    let cursorHighlightSize = 20;
    let cursorInside = false;
    let cursorX = 0;
    let cursorY = 0;

    // teleprompter (DOM overlay only; not part of canvas stream)
    let teleprompterText =
        "把你的讲稿粘贴到这里，然后点击开始滚动。\n\n你可以一边看提词器，一边在白板上讲解。";
    let showTeleprompter = false;
    let isTeleprompterRunning = false;
    let teleprompterSpeed = 40; // px/s
    let teleprompterFontSize = 14;
    let teleprompterOpacity = 92;
    let teleprompterScrollTop = 0;
    let teleprompterLastTs = 0;
    let teleprompterRaf = 0;

    let teleprompterTextEl: HTMLTextAreaElement;
    let teleprompterPanelEl: HTMLDivElement;

    let teleprompterHydrated = false;

    // draggable teleprompter panel
    const teleprompterBaseTop = 64;
    const teleprompterBaseRight = 12;

    let teleprompterOffsetX = 0;
    let teleprompterOffsetY = 0;
    let draggingTeleprompter = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragBaseX = 0;
    let dragBaseY = 0;

    // draggable floating controls
    let floatingControlsX = 0;
    let floatingControlsY = 0;
    let draggingFloatingControls = false;
    let fcDragStartX = 0;
    let fcDragStartY = 0;
    let fcDragBaseX = 0;
    let fcDragBaseY = 0;

    const startDragFloatingControls = (e: PointerEvent) => {
        draggingFloatingControls = true;
        fcDragStartX = e.clientX;
        fcDragStartY = e.clientY;
        fcDragBaseX = floatingControlsX;
        fcDragBaseY = floatingControlsY;
    };

    const ensureCameraStream = async () => {
        if (cameraStream && cameraVideoEl) return;
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
        });
        const v = document.createElement("video");
        v.srcObject = cameraStream;
        v.muted = true;
        v.playsInline = true;
        await v.play();
        cameraVideoEl = v;
    };

    const stopCameraStream = () => {
        if (cameraRenderRaf) cancelAnimationFrame(cameraRenderRaf);
        cameraRenderRaf = 0;
        stopBridgeComposite();
        if (cameraStream) {
            for (const track of cameraStream.getTracks()) track.stop();
        }
        cameraStream = null;
        cameraVideoEl = null;
    };

    const stopMicStream = () => {
        if (micStream) {
            for (const track of micStream.getTracks()) track.stop();
        }
        micStream = null;
        if (micDest) {
            for (const track of micDest.stream.getTracks()) track.stop();
        }
        micDest = null;
        if (micAudioCtx) {
            void micAudioCtx.close();
        }
        micAudioCtx = null;
    };

    type CameraPlacement = {
        size: number;
        baseX: number;
        baseY: number;
        x: number;
        y: number;
    };

    const getCameraBasePosition = (
        surfaceW: number,
        surfaceH: number,
        size: number,
    ) => {
        const baseX =
            cameraCorner === "br" || cameraCorner === "tr"
                ? surfaceW - cameraMargin - size
                : cameraMargin;
        const baseY =
            cameraCorner === "br" || cameraCorner === "bl"
                ? surfaceH - cameraMargin - size
                : cameraMargin;
        return { baseX, baseY };
    };

    const resolveCameraPlacement = (
        surfaceW: number,
        surfaceH: number,
    ): CameraPlacement => {
        const safeW = Math.max(1, surfaceW);
        const safeH = Math.max(1, surfaceH);
        const size = Math.min(cameraSize, safeW * 0.5, safeH * 0.5);
        const { baseX, baseY } = getCameraBasePosition(safeW, safeH, size);
        const maxX = Math.max(0, safeW - size);
        const maxY = Math.max(0, safeH - size);
        const x = Math.max(0, Math.min(maxX, baseX + cameraOffsetX));
        const y = Math.max(0, Math.min(maxY, baseY + cameraOffsetY));
        return { size, baseX, baseY, x, y };
    };

    const getCameraSurfaceSize = () => {
        const source = getRecordingCanvas();
        if (source) {
            const rect = source.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return { width: rect.width, height: rect.height };
            }
        }
        if (boardWrapEl) {
            const rect = boardWrapEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return { width: rect.width, height: rect.height };
            }
        }
        return null;
    };

    const clampCameraOverlayIntoSlide = () => {
        const surface = getCameraSurfaceSize();
        if (!surface) return;
        const placement = resolveCameraPlacement(surface.width, surface.height);
        const nextOffsetX = Math.round(placement.x - placement.baseX);
        const nextOffsetY = Math.round(placement.y - placement.baseY);
        if (nextOffsetX !== cameraOffsetX) cameraOffsetX = nextOffsetX;
        if (nextOffsetY !== cameraOffsetY) cameraOffsetY = nextOffsetY;
    };

    const getCameraOverlayStyle = () => {
        const surface = getCameraSurfaceSize();
        if (!surface) return "display:none;";
        const placement = resolveCameraPlacement(surface.width, surface.height);
        return `left:${placement.x}px; top:${placement.y}px; width:${placement.size}px; height:${placement.size}px; border-radius:${cameraRadius}px;`;
    };

    const startDragCameraOverlay = (e: PointerEvent) => {
        if (!isRecording || !showCameraInRecord || !cameraStream) return;
        const surface = getCameraSurfaceSize();
        if (!surface) return;
        const placement = resolveCameraPlacement(surface.width, surface.height);
        draggingCameraOverlay = true;
        cameraDragStartX = e.clientX;
        cameraDragStartY = e.clientY;
        cameraDragBaseX = placement.x;
        cameraDragBaseY = placement.y;
        cameraDragSurfaceW = surface.width;
        cameraDragSurfaceH = surface.height;
        cameraDragSize = placement.size;
        e.preventDefault();
        e.stopPropagation();
    };

    const refreshMicDevices = async () => {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            micDevices = all.filter((d) => d.kind === "audioinput");
            if (!selectedMicDeviceId && micDevices[0]) {
                selectedMicDeviceId = micDevices[0].deviceId;
            }
        } catch (e) {
            console.warn("enumerate mic devices failed", e);
        }
    };

    const stopMicLevelTest = () => {
        micTestRunning = false;
        micLevel = 0;
        if (micLevelRaf) cancelAnimationFrame(micLevelRaf);
        micLevelRaf = 0;
    };

    const runMicLevelTest = async () => {
        if (micTestRunning) {
            stopMicLevelTest();
            return;
        }
        try {
            const testStream = await navigator.mediaDevices.getUserMedia({
                audio: selectedMicDeviceId
                    ? { deviceId: { ideal: selectedMicDeviceId } }
                    : true,
                video: false,
            });
            const AC =
                window.AudioContext ||
                (
                    window as unknown as {
                        webkitAudioContext?: typeof AudioContext;
                    }
                ).webkitAudioContext;
            if (!AC) {
                exportNotice = "当前浏览器不支持麦克风电平检测。";
                exportNoticeLevel = "warn";
                for (const t of testStream.getTracks()) t.stop();
                return;
            }

            const testCtx = new AC();
            const src = testCtx.createMediaStreamSource(testStream);
            const analyser = testCtx.createAnalyser();
            analyser.fftSize = 1024;
            src.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            let peak = 0;
            micTestRunning = true;

            const tick = () => {
                if (!micTestRunning) return;
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = (data[i] - 128) / 128;
                    sum += Math.abs(v);
                }
                micLevel = Math.min(1, (sum / data.length) * 3.2);
                if (micLevel > peak) peak = micLevel;
                micLevelRaf = requestAnimationFrame(tick);
            };
            tick();

            window.setTimeout(() => {
                const finalPeak = peak;
                stopMicLevelTest();
                for (const t of testStream.getTracks()) t.stop();
                void testCtx.close();
                if (finalPeak < 0.02) {
                    exportNotice = "麦克风输入过低：请检查系统输入设备或权限。";
                    exportNoticeLevel = "warn";
                } else {
                    exportNotice = "麦克风检测通过。";
                    exportNoticeLevel = "info";
                }
            }, 3500);
        } catch (e) {
            exportNotice = "麦克风检测失败：请允许浏览器麦克风权限。";
            exportNoticeLevel = "error";
        }
    };

    const drawRoundRectPath = (
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
    ) => {
        if (!ctx) return;
        const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    };

    const drawCameraFrame = () => {
        if (
            !ctx ||
            !canvasEl ||
            !cameraVideoEl ||
            !isRecording ||
            !showCameraInRecord
        )
            return;
        const rect = canvasEl.getBoundingClientRect();
        const { size, x, y } = resolveCameraPlacement(rect.width, rect.height);

        ctx.save();
        drawRoundRectPath(x, y, size, size, cameraRadius);
        ctx.clip();
        ctx.fillStyle = "#000";
        ctx.fillRect(x, y, size, size);
        if (cameraMirror) {
            ctx.translate(x + size, y);
            ctx.scale(-1, 1);
            ctx.drawImage(cameraVideoEl, 0, 0, size, size);
        } else {
            ctx.drawImage(cameraVideoEl, x, y, size, size);
        }
        ctx.restore();

        ctx.save();
        drawRoundRectPath(x, y, size, size, cameraRadius);
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        cameraRenderRaf = requestAnimationFrame(drawCameraFrame);
    };

    const startCameraRenderLoop = async () => {
        if (!showCameraInRecord || !isRecording) return;
        await ensureCameraStream();
        if (cameraRenderRaf) cancelAnimationFrame(cameraRenderRaf);
        cameraRenderRaf = requestAnimationFrame(drawCameraFrame);
    };

    const stopBridgeComposite = () => {
        if (bridgeCompositeRaf) cancelAnimationFrame(bridgeCompositeRaf);
        bridgeCompositeRaf = 0;
        bridgeCompositeCtx = null;
        bridgeCompositeCanvas = null;
    };

    const drawRoundRectPathOn = (
        c: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
    ) => {
        const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        c.beginPath();
        c.moveTo(x + rr, y);
        c.arcTo(x + w, y, x + w, y + h, rr);
        c.arcTo(x + w, y + h, x, y + h, rr);
        c.arcTo(x, y + h, x, y, rr);
        c.arcTo(x, y, x + w, y, rr);
        c.closePath();
    };

    const startBridgeCompositeLoop = async (
        sourceCanvas: HTMLCanvasElement,
    ) => {
        await ensureCameraStream();

        const out = document.createElement("canvas");
        out.width = sourceCanvas.width || Math.max(2, sourceCanvas.clientWidth);
        out.height =
            sourceCanvas.height || Math.max(2, sourceCanvas.clientHeight);
        const outCtx = out.getContext("2d");
        if (!outCtx) throw new Error("composite ctx unavailable");

        bridgeCompositeCanvas = out;
        bridgeCompositeCtx = outCtx;

        const tick = () => {
            if (!bridgeCompositeCanvas || !bridgeCompositeCtx) return;

            const liveSource = getRecordingCanvas() || sourceCanvas;
            const srcW = liveSource.width || bridgeCompositeCanvas.width;
            const srcH = liveSource.height || bridgeCompositeCanvas.height;

            if (
                bridgeCompositeCanvas.width !== srcW ||
                bridgeCompositeCanvas.height !== srcH
            ) {
                bridgeCompositeCanvas.width = srcW;
                bridgeCompositeCanvas.height = srcH;
            }

            const w = bridgeCompositeCanvas.width;
            const h = bridgeCompositeCanvas.height;

            bridgeCompositeCtx.clearRect(0, 0, w, h);
            try {
                bridgeCompositeCtx.drawImage(liveSource, 0, 0, w, h);
            } catch {
                if (isRecording && !isRecordingStopping) {
                    exportNotice = "白板画面暂不可用，正在等待恢复…";
                    exportNoticeLevel = "warn";
                }
                bridgeCompositeRaf = requestAnimationFrame(tick);
                return;
            }

            if (cameraVideoEl && showCameraInRecord) {
                const { size, x, y } = resolveCameraPlacement(w, h);

                bridgeCompositeCtx.save();
                drawRoundRectPathOn(
                    bridgeCompositeCtx,
                    x,
                    y,
                    size,
                    size,
                    cameraRadius,
                );
                bridgeCompositeCtx.clip();
                bridgeCompositeCtx.fillStyle = "#000";
                bridgeCompositeCtx.fillRect(x, y, size, size);
                if (cameraMirror) {
                    bridgeCompositeCtx.translate(x + size, y);
                    bridgeCompositeCtx.scale(-1, 1);
                    bridgeCompositeCtx.drawImage(
                        cameraVideoEl,
                        0,
                        0,
                        size,
                        size,
                    );
                } else {
                    bridgeCompositeCtx.drawImage(
                        cameraVideoEl,
                        x,
                        y,
                        size,
                        size,
                    );
                }
                bridgeCompositeCtx.restore();

                bridgeCompositeCtx.save();
                drawRoundRectPathOn(
                    bridgeCompositeCtx,
                    x,
                    y,
                    size,
                    size,
                    cameraRadius,
                );
                bridgeCompositeCtx.strokeStyle = "rgba(255,255,255,0.8)";
                bridgeCompositeCtx.lineWidth = 2;
                bridgeCompositeCtx.stroke();
                bridgeCompositeCtx.restore();
            }

            bridgeCompositeRaf = requestAnimationFrame(tick);
        };

        if (bridgeCompositeRaf) cancelAnimationFrame(bridgeCompositeRaf);
        bridgeCompositeRaf = requestAnimationFrame(tick);
        return out;
    };

    const scheduleProjectAutosave = (delay = 600) => {
        if (typeof window === "undefined") return;
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = window.setTimeout(() => {
            autosaveTimer = null;
            saveProjectSnapshot();
        }, delay);
    };

    const saveProjectSnapshot = () => {
        if (typeof window === "undefined") return;
        const payload: ProjectSnapshot = {
            version: 2,
            slides,
            bridgeSlides,
            activeSlide,
            frames,
            webEmbeds,
            settings: {
                aspectRatio,
                backgroundColor,
                canvasCornerRadius,
                canvasInnerPadding,
            },
        };
        window.localStorage.setItem(
            "videorecord.project",
            JSON.stringify(payload),
        );
        lastProjectSaveAt = Date.now();
    };

    const loadProjectSnapshot = () => {
        if (typeof window === "undefined") return;
        const raw = window.localStorage.getItem("videorecord.project");
        if (!raw) return;
        try {
            const data = JSON.parse(raw) as Partial<ProjectSnapshot> & {
                version?: number;
            };
            if (!data || (data.version !== 1 && data.version !== 2)) return;
            slides =
                Array.isArray(data.slides) && data.slides.length
                    ? data.slides
                    : [""];

            if (Array.isArray(data.bridgeSlides) && data.bridgeSlides.length) {
                bridgeSlides = data.bridgeSlides.map((scene) => ({
                    elements: Array.isArray(scene?.elements)
                        ? scene.elements
                        : [],
                    appState:
                        scene?.appState && typeof scene.appState === "object"
                            ? scene.appState
                            : {},
                    files:
                        scene?.files && typeof scene.files === "object"
                            ? scene.files
                            : {},
                }));
            } else {
                bridgeSlides = slides.map(() => ({
                    elements: [],
                    appState: {},
                    files: {},
                }));
            }
            if (bridgeSlides.length < slides.length) {
                bridgeSlides = [
                    ...bridgeSlides,
                    ...Array.from(
                        { length: slides.length - bridgeSlides.length },
                        () => ({ elements: [], appState: {}, files: {} }),
                    ),
                ];
            }

            activeSlide = Math.max(
                0,
                Math.min(data.activeSlide || 0, slides.length - 1),
            );
            frames = Array.isArray(data.frames) ? data.frames : [];
            webEmbeds = Array.isArray(data.webEmbeds) ? data.webEmbeds : [];
            aspectRatio = data.settings?.aspectRatio || aspectRatio;
            backgroundColor = data.settings?.backgroundColor || backgroundColor;
            canvasCornerRadius = Number.isFinite(
                data.settings?.canvasCornerRadius,
            )
                ? data.settings.canvasCornerRadius
                : canvasCornerRadius;
            canvasInnerPadding = Number.isFinite(
                data.settings?.canvasInnerPadding,
            )
                ? data.settings.canvasInnerPadding
                : canvasInnerPadding;
            requestAnimationFrame(() => loadSlide(activeSlide));
        } catch {
            // ignore broken snapshot
        }
    };

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

    const cloneBridgeScene = (scene: BridgeSlideScene) => {
        if (typeof structuredClone === "function")
            return structuredClone(scene);
        return JSON.parse(JSON.stringify(scene));
    };

    const toPersistedBridgeAppState = (
        appState: Record<string, unknown> | undefined,
    ) => ({
        viewBackgroundColor:
            (appState?.viewBackgroundColor as string) || backgroundColor,
        theme: "light",
        zenModeEnabled: false,
        viewModeEnabled: false,
    });

    const normalizeBridgeAppState = (
        appState: Record<string, unknown> | undefined,
    ) => {
        const next = { ...(appState ?? {}) } as Record<string, unknown>;
        next.theme = "light";
        next.viewBackgroundColor = backgroundColor;
        next.zenModeEnabled = false;
        next.viewModeEnabled = false;
        next.openSidebar = null;
        next.openDialog = null;
        next.showHelpDialog = false;
        const collaborators = (next as { collaborators?: unknown })
            .collaborators;
        if (
            !collaborators ||
            typeof (collaborators as { forEach?: unknown }).forEach !==
                "function"
        ) {
            (next as { collaborators: Map<string, unknown> }).collaborators =
                new Map();
        }
        return next;
    };

    const captureBridgeScene = () => {
        if (!excalidrawApi) return { elements: [], appState: {}, files: {} };
        return {
            elements: excalidrawApi.getSceneElements?.() ?? [],
            appState: toPersistedBridgeAppState(
                excalidrawApi.getAppState?.() ?? {},
            ),
            files: excalidrawApi.getFiles?.() ?? {},
        };
    };

    const applyBridgeScene = (scene: BridgeSlideScene) => {
        if (!excalidrawApi) return;
        const nextAppState = normalizeBridgeAppState(scene.appState);
        excalidrawApi.updateScene?.({
            elements: scene.elements,
            appState: nextAppState,
            files: scene.files,
        });
    };

    const saveCurrentSlide = () => {
        if (activeSlide < 0 || activeSlide >= slides.length) return;

        const next = [...slides];
        const source = getRecordingCanvas() || canvasEl;
        if (source) {
            next[activeSlide] = source.toDataURL("image/png");
            slides = next;
        }

        if (useExcalidrawBridge) {
            const bridgeNext = [...bridgeSlides];
            bridgeNext[activeSlide] = cloneBridgeScene(captureBridgeScene());
            bridgeSlides = bridgeNext;
            return;
        }
    };

    const loadSlide = (index: number) => {
        if (index < 0 || index >= slides.length) return;
        activeSlide = index;

        if (useExcalidrawBridge) {
            const scene = bridgeSlides[index] ?? {
                elements: [],
                appState: {},
                files: {},
            };
            requestAnimationFrame(() => applyBridgeScene(scene));
            return;
        }

        if (!ctx || !canvasEl) return;
        const data = slides[index];
        if (!data) {
            fillCanvasBg();
            undoStack = [];
            redoStack = [];
            pushHistorySnapshot();
            return;
        }
        const img = new Image();
        img.onload = () => {
            const rect = canvasEl.getBoundingClientRect();
            fillCanvasBg();
            ctx?.drawImage(img, 0, 0, rect.width, rect.height);
            undoStack = [];
            redoStack = [];
            pushHistorySnapshot();
        };
        img.src = data;
    };

    const pushHistorySnapshot = () => {
        if (!canvasEl) return;
        const snap = canvasEl.toDataURL("image/png");
        if (
            undoStack.length === 0 ||
            undoStack[undoStack.length - 1] !== snap
        ) {
            undoStack = [...undoStack, snap].slice(-80);
            redoStack = [];
        }
    };

    const applySnapshotToCanvas = (data: string) => {
        if (!ctx || !canvasEl) return;
        if (!data) {
            fillCanvasBg();
            saveCurrentSlide();
            return;
        }

        const img = new Image();
        img.onload = () => {
            const rect = canvasEl.getBoundingClientRect();
            fillCanvasBg();
            ctx?.drawImage(img, 0, 0, rect.width, rect.height);
            saveCurrentSlide();
        };
        img.src = data;
    };

    const undo = () => {
        if (!canvasEl || undoStack.length === 0) return;
        const current = canvasEl.toDataURL("image/png");
        const prev = undoStack[undoStack.length - 1];
        undoStack = undoStack.slice(0, -1);
        redoStack = [...redoStack, current].slice(-80);
        applySnapshotToCanvas(prev);
    };

    const redo = () => {
        if (!canvasEl || redoStack.length === 0) return;
        const current = canvasEl.toDataURL("image/png");
        const next = redoStack[redoStack.length - 1];
        redoStack = redoStack.slice(0, -1);
        undoStack = [...undoStack, current].slice(-80);
        applySnapshotToCanvas(next);
    };

    const addSlide = () => {
        saveCurrentSlide();
        slides = [...slides, ""];
        bridgeSlides = [
            ...bridgeSlides,
            { elements: [], appState: {}, files: {} },
        ];
        activeSlide = slides.length - 1;
        undoStack = [];
        redoStack = [];
        if (useExcalidrawBridge) {
            requestAnimationFrame(() => loadSlide(activeSlide));
        } else {
            requestAnimationFrame(() => fillCanvasBg());
        }
    };

    const duplicateSlide = () => {
        saveCurrentSlide();
        const clone = slides[activeSlide] || "";
        const next = [...slides];
        next.splice(activeSlide + 1, 0, clone);
        slides = next;

        const bridgeNext = [...bridgeSlides];
        const sceneClone = cloneBridgeScene(
            bridgeSlides[activeSlide] ?? {
                elements: [],
                appState: {},
                files: {},
            },
        );
        bridgeNext.splice(activeSlide + 1, 0, sceneClone);
        bridgeSlides = bridgeNext;

        activeSlide = activeSlide + 1;
        requestAnimationFrame(() => loadSlide(activeSlide));
    };

    const deleteSlide = () => {
        if (slides.length <= 1) {
            slides = [""];
            bridgeSlides = [{ elements: [], appState: {}, files: {} }];
            activeSlide = 0;
            if (useExcalidrawBridge) {
                requestAnimationFrame(() => loadSlide(0));
            } else {
                requestAnimationFrame(() => fillCanvasBg());
            }
            return;
        }

        const next = [...slides];
        next.splice(activeSlide, 1);

        const bridgeNext = [...bridgeSlides];
        bridgeNext.splice(activeSlide, 1);

        const target = Math.min(activeSlide, next.length - 1);
        slides = next;
        bridgeSlides = bridgeNext.length
            ? bridgeNext
            : [{ elements: [], appState: {}, files: {} }];
        activeSlide = target;
        requestAnimationFrame(() => loadSlide(target));
    };

    const moveSlide = (dir: -1 | 1) => {
        saveCurrentSlide();
        const from = activeSlide;
        const to = from + dir;
        if (to < 0 || to >= slides.length) return;

        const next = [...slides];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        slides = next;

        const bridgeNext = [...bridgeSlides];
        const [sceneItem] = bridgeNext.splice(from, 1);
        bridgeNext.splice(
            to,
            0,
            sceneItem ?? { elements: [], appState: {}, files: {} },
        );
        bridgeSlides = bridgeNext;

        activeSlide = to;
    };

    const onSlideDragStart = (index: number) => {
        saveCurrentSlide();
        draggingSlideIndex = index;
    };

    const onSlideDrop = (targetIndex: number) => {
        if (draggingSlideIndex === null || draggingSlideIndex === targetIndex) {
            draggingSlideIndex = null;
            return;
        }

        const next = [...slides];
        const [item] = next.splice(draggingSlideIndex, 1);
        next.splice(targetIndex, 0, item);

        const bridgeNext = [...bridgeSlides];
        const [sceneItem] = bridgeNext.splice(draggingSlideIndex, 1);
        bridgeNext.splice(
            targetIndex,
            0,
            sceneItem ?? { elements: [], appState: {}, files: {} },
        );

        const oldActive = activeSlide;
        let newActive = oldActive;

        if (oldActive === draggingSlideIndex) {
            newActive = targetIndex;
        } else if (draggingSlideIndex < oldActive && targetIndex >= oldActive) {
            newActive = oldActive - 1;
        } else if (draggingSlideIndex > oldActive && targetIndex <= oldActive) {
            newActive = oldActive + 1;
        }

        slides = next;
        bridgeSlides = bridgeNext;
        activeSlide = newActive;
        draggingSlideIndex = null;
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

        saveCurrentSlide();
    };

    const triggerResizeNextFrame = () => {
        requestAnimationFrame(() => {
            resizeCanvas();
        });
    };

    const clamp = (v: number, min: number, max: number) =>
        Math.min(max, Math.max(min, v));

    const clampAndSnapTeleprompter = () => {
        if (!teleprompterPanelEl || typeof window === "undefined") return;

        const panelRect = teleprompterPanelEl.getBoundingClientRect();

        const minX = -(
            window.innerWidth -
            panelRect.width -
            teleprompterBaseRight
        );
        const maxX = teleprompterBaseRight;

        const minY = -teleprompterBaseTop + 8;
        const maxY =
            window.innerHeight - panelRect.height - teleprompterBaseTop - 8;

        teleprompterOffsetX = clamp(teleprompterOffsetX, minX, maxX);
        teleprompterOffsetY = clamp(teleprompterOffsetY, minY, maxY);
    };

    const persistTeleprompterPrefs = () => {
        if (!teleprompterHydrated || typeof window === "undefined") return;
        const payload = {
            x: teleprompterOffsetX,
            y: teleprompterOffsetY,
            speed: teleprompterSpeed,
            opacity: teleprompterOpacity,
            fontSize: teleprompterFontSize,
        };
        window.localStorage.setItem(
            "videorecord.teleprompter",
            JSON.stringify(payload),
        );
    };

    const unmountExcalidrawBridge = () => {
        if (cleanupExcalidraw) cleanupExcalidraw();
        cleanupExcalidraw = null;
        excalidrawMounted = false;
        excalidrawApi = null;
    };

    const clearExcalidrawPersistedUiState = () => {
        if (typeof window === "undefined") return;
        try {
            const keys: string[] = [];
            for (let i = 0; i < window.localStorage.length; i += 1) {
                const k = window.localStorage.key(i);
                if (!k) continue;
                const name = k.toLowerCase();
                if (
                    name.includes("excalidraw") ||
                    name.includes("excalidraw-state")
                )
                    keys.push(k);
            }
            for (const k of keys) window.localStorage.removeItem(k);
        } catch {
            // ignore storage cleanup errors
        }
    };

    const mountExcalidrawBridge = async () => {
        if (!useExcalidrawBridge || !excalidrawHostEl || excalidrawMounted)
            return;
        const token = ++excalidrawMountToken;

        try {
            clearExcalidrawPersistedUiState();
            const React = await import("react");
            const ReactDOMClient = await import("react-dom/client");
            const pkg = await import("@excalidraw/excalidraw");

            if (
                token !== excalidrawMountToken ||
                !useExcalidrawBridge ||
                !excalidrawHostEl
            )
                return;

            const root = ReactDOMClient.createRoot(excalidrawHostEl);
            const ExcalidrawComp = (pkg as { Excalidraw: unknown })
                .Excalidraw as unknown as any;

            root.render(
                React.createElement(ExcalidrawComp, {
                    name: excalidrawSessionName,
                    UIOptions: {
                        canvasActions: {
                            export: false,
                            saveToActiveFile: false,
                        },
                    },
                    initialData: {
                        appState: {
                            viewBackgroundColor: backgroundColor,
                            theme: "light",
                            zenModeEnabled: false,
                            viewModeEnabled: false,
                        },
                    },
                    excalidrawAPI: (api: any) => {
                        excalidrawApi = api;
                        const scene = bridgeSlides[activeSlide] ?? {
                            elements: [],
                            appState: {},
                            files: {},
                        };
                        requestAnimationFrame(() => applyBridgeScene(scene));
                        window.setTimeout(() => {
                            if (!excalidrawApi) return;
                            bridgeAppStateGuard = true;
                            excalidrawApi.updateScene?.({
                                appState: normalizeBridgeAppState(
                                    excalidrawApi.getAppState?.() ?? {},
                                ),
                            });
                            bridgeAppStateGuard = false;
                        }, 240);
                    },
                    onChange: (
                        elements: any[],
                        appState: Record<string, unknown>,
                        files: Record<string, unknown>,
                    ) => {
                        if (
                            !useExcalidrawBridge ||
                            activeSlide < 0 ||
                            activeSlide >= slides.length
                        )
                            return;

                        const normalized = normalizeBridgeAppState(appState);
                        if (
                            !bridgeAppStateGuard &&
                            (appState.zenModeEnabled !== false ||
                                appState.viewModeEnabled !== false)
                        ) {
                            bridgeAppStateGuard = true;
                            excalidrawApi?.updateScene?.({
                                appState: normalized,
                            });
                            bridgeAppStateGuard = false;
                        }

                        const bridgeNext = [...bridgeSlides];
                        bridgeNext[activeSlide] = cloneBridgeScene({
                            elements,
                            appState: toPersistedBridgeAppState(normalized),
                            files,
                        });
                        bridgeSlides = bridgeNext;
                        const source = getRecordingCanvas();
                        if (!source) return;
                        requestAnimationFrame(() => {
                            const thumbs = [...slides];
                            thumbs[activeSlide] = source.toDataURL("image/png");
                            slides = thumbs;
                        });
                    },
                    theme: "light",
                }),
            );

            cleanupExcalidraw = () => {
                root.unmount();
            };
            excalidrawMounted = true;
        } catch (e) {
            console.error("excalidraw bridge mount failed", e);
            exportNotice = "白板加载失败，请刷新页面重试。";
            exportNoticeLevel = "error";
            excalidrawMounted = false;
        }
    };

    onMount(() => {
        ctx = canvasEl.getContext("2d");
        if (!ctx) return;

        resizeCanvas();
        loadProjectSnapshot();
        pushHistorySnapshot();

        try {
            const raw = window.localStorage.getItem("videorecord.teleprompter");
            if (raw) {
                const saved = JSON.parse(raw);
                if (typeof saved.x === "number") teleprompterOffsetX = saved.x;
                if (typeof saved.y === "number") teleprompterOffsetY = saved.y;
                if (typeof saved.speed === "number")
                    teleprompterSpeed = saved.speed;
                if (typeof saved.opacity === "number")
                    teleprompterOpacity = saved.opacity;
                if (typeof saved.fontSize === "number")
                    teleprompterFontSize = saved.fontSize;
            }
        } catch {
            // ignore storage parse errors
        }

        requestAnimationFrame(() => {
            clampAndSnapTeleprompter();
            teleprompterHydrated = true;
            persistTeleprompterPrefs();
        });

        window.addEventListener("resize", resizeCanvas);
        window.addEventListener("resize", clampAndSnapTeleprompter);
        window.addEventListener("resize", clampCameraOverlayIntoSlide);
        window.addEventListener("devicechange", refreshMicDevices);
        void refreshMicDevices();

        return () => {
            window.removeEventListener("resize", resizeCanvas);
            window.removeEventListener("resize", clampAndSnapTeleprompter);
            window.removeEventListener("resize", clampCameraOverlayIntoSlide);
            window.removeEventListener("devicechange", refreshMicDevices);
            if (timer) clearInterval(timer);
            clearStopTimer();
            if (autosaveTimer) {
                clearTimeout(autosaveTimer);
                autosaveTimer = null;
            }
            if (teleprompterRaf) cancelAnimationFrame(teleprompterRaf);
            if (cameraRenderRaf) cancelAnimationFrame(cameraRenderRaf);
            stopCameraStream();
            stopBridgeComposite();
            stopMicStream();
            unmountExcalidrawBridge();
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

    const drawShapePreview = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
    ) => {
        if (!ctx || !shapeSnapshot) return;

        ctx.putImageData(shapeSnapshot, 0, 0);
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (tool === "line") {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        } else if (tool === "rect") {
            const x = Math.min(x1, x2);
            const y = Math.min(y1, y2);
            const w = Math.abs(x2 - x1);
            const h = Math.abs(y2 - y1);
            ctx.strokeRect(x, y, w, h);
        } else if (tool === "circle") {
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const rx = Math.abs(x2 - x1) / 2;
            const ry = Math.abs(y2 - y1) / 2;
            ctx.beginPath();
            if (typeof ctx.ellipse === "function") {
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            } else {
                const r = Math.min(rx, ry);
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
            }
            ctx.stroke();
        }

        ctx.restore();
    };

    const beginDraw = (e: PointerEvent) => {
        if (useExcalidrawBridge) return;
        if (!ctx) return;

        const p = getPoint(e);

        if (tool === "text") {
            textInputX = p.x;
            textInputY = p.y;
            textInputValue = "";
            textEditing = true;
            requestAnimationFrame(() => textAreaEl?.focus());
            return;
        }

        if (tool === "select") {
            marqueeAdditive = e.shiftKey;
            slideDragCandidate = true;
            slideDragging = false;
            slideDragStartX = e.clientX;
            slideDragStartY = e.clientY;
            slideDragCurrentX = e.clientX;
            marqueeSelecting = false;
            marqueeStartX = e.clientX;
            marqueeStartY = e.clientY;
            marqueeX = e.clientX;
            marqueeY = e.clientY;
            marqueeW = 0;
            marqueeH = 0;
            if (!marqueeAdditive) {
                clearAllSelections();
            }
            return;
        }

        if (tool === "laser") {
            laserPressed = true;
            return;
        }

        if (tool === "webembed") {
            beginCreateWebEmbed(e.clientX, e.clientY);
            return;
        }

        pushHistorySnapshot();
        drawing = true;
        lastX = p.x;
        lastY = p.y;

        if (tool === "line" || tool === "rect" || tool === "circle") {
            shapeStartX = p.x;
            shapeStartY = p.y;
            shapeSnapshot = ctx.getImageData(
                0,
                0,
                canvasEl.width,
                canvasEl.height,
            );
        } else {
            shapeSnapshot = null;
        }

        canvasEl.setPointerCapture(e.pointerId);
    };

    const draw = (e: PointerEvent) => {
        if (useExcalidrawBridge) return;
        updateCursorPosition(e);
        if (tool === "laser") return;
        if (tool === "select") {
            const dx = e.clientX - slideDragStartX;
            const dy = e.clientY - slideDragStartY;
            if (slideDragCandidate && !marqueeSelecting && !slideDragging) {
                if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    slideDragging = true;
                    slideDragCurrentX = e.clientX;
                } else if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    marqueeSelecting = true;
                }
            }

            if (slideDragging) {
                slideDragCurrentX = e.clientX;
                return;
            }

            if (marqueeSelecting) {
                const x1 = Math.min(marqueeStartX, e.clientX);
                const y1 = Math.min(marqueeStartY, e.clientY);
                const x2 = Math.max(marqueeStartX, e.clientX);
                const y2 = Math.max(marqueeStartY, e.clientY);
                marqueeX = x1;
                marqueeY = y1;
                marqueeW = x2 - x1;
                marqueeH = y2 - y1;
                return;
            }
        }
        if (tool === "frame" && draftingFrame) {
            const x1 = Math.min(draftFrameX, e.clientX);
            const y1 = Math.min(draftFrameY, e.clientY);
            const x2 = Math.max(draftFrameX, e.clientX);
            const y2 = Math.max(draftFrameY, e.clientY);
            draftFrameX = x1;
            draftFrameY = y1;
            draftFrameW = x2 - x1;
            draftFrameH = y2 - y1;
            return;
        }
        if (!drawing || !ctx || tool === "text") return;

        const p = getPoint(e);

        if (tool === "line" || tool === "rect" || tool === "circle") {
            drawShapePreview(shapeStartX, shapeStartY, p.x, p.y);
            lastX = p.x;
            lastY = p.y;
            return;
        }

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
        if (useExcalidrawBridge) return;
        if (tool === "laser") {
            laserPressed = false;
            try {
                canvasEl.releasePointerCapture(e.pointerId);
            } catch {}
            return;
        }

        if (tool === "select") {
            if (slideDragging) {
                const dx = slideDragCurrentX - slideDragStartX;
                if (Math.abs(dx) > 80) {
                    moveSlide(dx < 0 ? 1 : -1);
                }
            }
            slideDragCandidate = false;
            slideDragging = false;
            marqueeSelecting = false;
            marqueeW = 0;
            marqueeH = 0;
            return;
        }

        drawing = false;
        saveCurrentSlide();
        shapeSnapshot = null;
        try {
            canvasEl.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
    };

    const clearCanvas = () => {
        pushHistorySnapshot();
        fillCanvasBg();
        saveCurrentSlide();
    };

    const commitTextToCanvas = () => {
        if (!ctx || !canvasEl || !textEditing) return;

        const lines = textInputValue
            .split("\n")
            .filter((line) => line.trim().length > 0);
        textEditing = false;
        if (!lines.length) {
            textInputValue = "";
            return;
        }

        pushHistorySnapshot();
        ctx.save();
        ctx.fillStyle = strokeColor;
        ctx.font = `700 ${textFontSize}px sans-serif`;
        ctx.textBaseline = "top";
        const lineHeight = Math.round(textFontSize * 1.35);
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], textInputX, textInputY + i * lineHeight);
        }
        ctx.restore();

        saveCurrentSlide();
        textInputValue = "";
    };

    const cancelTextInput = () => {
        textEditing = false;
        textInputValue = "";
    };

    const onTextInputKeydown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            commitTextToCanvas();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            cancelTextInput();
        }
    };

    const insertImageFromFile = (file: File) => {
        if (!ctx || !canvasEl || !file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const src = reader.result;
            if (typeof src !== "string") return;

            const img = new Image();
            img.onload = () => {
                if (!ctx || !canvasEl) return;
                pushHistorySnapshot();

                const rect = canvasEl.getBoundingClientRect();
                const maxW = rect.width * 0.78;
                const maxH = rect.height * 0.78;
                const scale = Math.min(maxW / img.width, maxH / img.height, 1);

                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const x = (rect.width - drawW) / 2;
                const y = (rect.height - drawH) / 2;

                ctx.drawImage(img, x, y, drawW, drawH);
                saveCurrentSlide();
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
    };

    const onPickImage = () => {
        imageInputEl?.click();
    };

    const onImageSelected = (e: Event) => {
        const target = e.currentTarget as HTMLInputElement;
        const file = target.files?.[0];
        if (file) insertImageFromFile(file);
        target.value = "";
    };

    const beginCreateWebEmbed = (x: number, y: number) => {
        const raw = window.prompt("输入要嵌入的网址（https://...）");
        if (!raw) return;
        const url = raw.trim();
        if (!/^https?:\/\//i.test(url)) {
            window.alert("请输入 http(s) 开头的链接");
            return;
        }

        const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        webEmbeds = [
            ...webEmbeds,
            {
                id,
                url,
                x,
                y,
                w: 360,
                h: 220,
                locked: false,
                hidden: false,
                opacity: 1,
                flipX: false,
                flipY: false,
            },
        ];
        selectedEmbedId = id;
        selectedEmbedIds = [id];
        selectedFrameId = null;
        selectedFrameIds = [];
    };

    const removeWebEmbed = (id: string) => {
        webEmbeds = webEmbeds.filter((e) => e.id !== id);
        if (selectedEmbedId === id) selectedEmbedId = null;
    };

    const moveWebEmbedLayer = (id: string, dir: -1 | 1) => {
        const idx = webEmbeds.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const to = idx + dir;
        if (to < 0 || to >= webEmbeds.length) return;
        const next = [...webEmbeds];
        const [item] = next.splice(idx, 1);
        next.splice(to, 0, item);
        webEmbeds = next;
    };

    const alignSelectedEmbed = (
        mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
    ) => {
        if (!selectedEmbedId) return;
        webEmbeds = webEmbeds.map((em) => {
            if (em.id !== selectedEmbedId) return em;
            let x = em.x;
            let y = em.y;
            if (mode === "left") x = 8;
            if (mode === "center")
                x = Math.round((window.innerWidth - em.w) / 2);
            if (mode === "right") x = Math.round(window.innerWidth - em.w - 8);
            if (mode === "top") y = 8;
            if (mode === "middle")
                y = Math.round((window.innerHeight - em.h) / 2);
            if (mode === "bottom")
                y = Math.round(window.innerHeight - em.h - 8);
            const c = clampToViewport(x, y, em.w, em.h);
            return { ...em, x: c.x, y: c.y };
        });
    };

    const resizeSelectedEmbedPreset = (
        preset: "small" | "medium" | "large",
    ) => {
        if (!selectedEmbedId) return;
        webEmbeds = webEmbeds.map((em) => {
            if (em.id !== selectedEmbedId) return em;
            const size =
                preset === "small"
                    ? { w: 300, h: 180 }
                    : preset === "medium"
                      ? { w: 420, h: 252 }
                      : { w: 560, h: 336 };
            const c = clampToViewport(em.x, em.y, size.w, size.h);
            return { ...em, ...size, x: c.x, y: c.y };
        });
    };

    const updateGuidesForRect = (
        x: number,
        y: number,
        w: number,
        h: number,
    ) => {
        const centerX = Math.round((window.innerWidth - w) / 2);
        const centerY = Math.round((window.innerHeight - h) / 2);

        const leftEdge = 8;
        const topEdge = 8;
        const rightEdge = Math.round(window.innerWidth - w - 8);
        const bottomEdge = Math.round(window.innerHeight - h - 8);

        showGuideV = false;
        showGuideH = false;

        if (Math.abs(x - centerX) <= 10) {
            showGuideV = true;
            guideVX = Math.round(window.innerWidth / 2);
        } else if (Math.abs(x - leftEdge) <= 10) {
            showGuideV = true;
            guideVX = leftEdge;
        } else if (Math.abs(x - rightEdge) <= 10) {
            showGuideV = true;
            guideVX = Math.round(window.innerWidth - 8);
        }

        if (Math.abs(y - centerY) <= 10) {
            showGuideH = true;
            guideHY = Math.round(window.innerHeight / 2);
        } else if (Math.abs(y - topEdge) <= 10) {
            showGuideH = true;
            guideHY = topEdge;
        } else if (Math.abs(y - bottomEdge) <= 10) {
            showGuideH = true;
            guideHY = Math.round(window.innerHeight - 8);
        }
    };

    const startDragWebEmbed = (id: string, e: PointerEvent) => {
        const item = webEmbeds.find((x) => x.id === id);
        if (!item || item.locked || item.hidden) return;
        draggingEmbedId = id;
        selectedEmbedId = id;
        selectedEmbedIds = [id];
        selectedFrameId = null;
        selectedFrameIds = [];
        embedDragOffsetX = e.clientX - item.x;
        embedDragOffsetY = e.clientY - item.y;
    };

    const startResizeWebEmbed = (id: string, e: PointerEvent) => {
        const item = webEmbeds.find((x) => x.id === id);
        if (!item || item.locked || item.hidden) return;
        resizingEmbedId = id;
        embedResizeStartX = e.clientX;
        embedResizeStartY = e.clientY;
        embedResizeStartW = item.w;
        embedResizeStartH = item.h;
    };

    const editWebEmbedUrl = (id: string) => {
        const item = webEmbeds.find((x) => x.id === id);
        if (!item) return;
        const next = window.prompt("编辑嵌入网址", item.url);
        if (!next) return;
        const url = next.trim();
        if (!/^https?:\/\//i.test(url)) return;
        webEmbeds = webEmbeds.map((e) => (e.id === id ? { ...e, url } : e));
    };

    const onWindowPointerMoveEmbed = (e: PointerEvent) => {
        if (draggingEmbedId) {
            webEmbeds = webEmbeds.map((item) => {
                if (item.id !== draggingEmbedId) return item;
                const nx = e.clientX - embedDragOffsetX;
                const ny = e.clientY - embedDragOffsetY;
                const clamped = clampToViewport(nx, ny, item.w, item.h);
                updateGuidesForRect(clamped.x, clamped.y, item.w, item.h);
                return { ...item, x: clamped.x, y: clamped.y };
            });
        }

        if (resizingEmbedId) {
            const dx = e.clientX - embedResizeStartX;
            const dy = e.clientY - embedResizeStartY;
            webEmbeds = webEmbeds.map((item) => {
                if (item.id !== resizingEmbedId) return item;
                const nextW = Math.max(220, embedResizeStartW + dx);
                const nextH = Math.max(140, embedResizeStartH + dy);
                const maxW = Math.max(220, window.innerWidth - item.x - 8);
                const maxH = Math.max(140, window.innerHeight - item.y - 8);
                return {
                    ...item,
                    w: Math.min(maxW, nextW),
                    h: Math.min(maxH, nextH),
                };
            });
        }
    };

    const onWindowPointerUpEmbed = () => {
        showGuideV = false;
        showGuideH = false;
        webEmbeds = webEmbeds.map((item) => {
            const maxX = Math.max(8, window.innerWidth - item.w - 8);
            const maxY = Math.max(8, window.innerHeight - item.h - 8);
            let x = item.x;
            let y = item.y;
            x = snapValue(x, 8);
            y = snapValue(y, 8);
            x = snapValue(x, maxX);
            y = snapValue(y, maxY);
            const c = clampToViewport(x, y, item.w, item.h);
            return { ...item, x: c.x, y: c.y };
        });
        draggingEmbedId = null;
        resizingEmbedId = null;
    };

    const startDragFrame = (id: string, e: PointerEvent) => {
        const f = frames.find((x) => x.id === id);
        if (!f || f.locked || f.hidden) return;
        draggingFrameId = id;
        selectedFrameId = id;
        selectedEmbedId = null;
        frameDragOffsetX = e.clientX - f.x;
        frameDragOffsetY = e.clientY - f.y;
    };

    const startResizeFrame = (id: string, e: PointerEvent) => {
        const f = frames.find((x) => x.id === id);
        if (!f || f.locked || f.hidden) return;
        resizingFrameId = id;
        frameResizeStartX = e.clientX;
        frameResizeStartY = e.clientY;
        frameResizeStartW = f.w;
        frameResizeStartH = f.h;
    };

    const removeFrame = (id: string) => {
        frames = frames.filter((f) => f.id !== id);
        if (selectedFrameId === id) selectedFrameId = null;
    };

    const moveFrameLayer = (id: string, dir: -1 | 1) => {
        const idx = frames.findIndex((f) => f.id === id);
        if (idx < 0) return;
        const to = idx + dir;
        if (to < 0 || to >= frames.length) return;
        const next = [...frames];
        const [item] = next.splice(idx, 1);
        next.splice(to, 0, item);
        frames = next;
    };

    const alignSelectedFrame = (
        mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
    ) => {
        if (!selectedFrameId) return;
        frames = frames.map((f) => {
            if (f.id !== selectedFrameId) return f;
            let x = f.x;
            let y = f.y;
            if (mode === "left") x = 8;
            if (mode === "center")
                x = Math.round((window.innerWidth - f.w) / 2);
            if (mode === "right") x = Math.round(window.innerWidth - f.w - 8);
            if (mode === "top") y = 8;
            if (mode === "middle")
                y = Math.round((window.innerHeight - f.h) / 2);
            if (mode === "bottom") y = Math.round(window.innerHeight - f.h - 8);
            const c = clampToViewport(x, y, f.w, f.h);
            return { ...f, x: c.x, y: c.y };
        });
    };

    const onWindowPointerMoveFrame = (e: PointerEvent) => {
        if (draggingFrameId) {
            frames = frames.map((f) => {
                if (f.id !== draggingFrameId) return f;
                const nx = e.clientX - frameDragOffsetX;
                const ny = e.clientY - frameDragOffsetY;
                const c = clampToViewport(nx, ny, f.w, f.h);
                updateGuidesForRect(c.x, c.y, f.w, f.h);
                return { ...f, x: c.x, y: c.y };
            });
        }
        if (resizingFrameId) {
            const dx = e.clientX - frameResizeStartX;
            const dy = e.clientY - frameResizeStartY;
            frames = frames.map((f) => {
                if (f.id !== resizingFrameId) return f;
                const nextW = Math.max(120, frameResizeStartW + dx);
                const nextH = Math.max(80, frameResizeStartH + dy);
                const maxW = Math.max(120, window.innerWidth - f.x - 8);
                const maxH = Math.max(80, window.innerHeight - f.y - 8);
                return {
                    ...f,
                    w: Math.min(maxW, nextW),
                    h: Math.min(maxH, nextH),
                };
            });
        }
    };

    const onWindowPointerUpFrame = () => {
        showGuideV = false;
        showGuideH = false;
        frames = frames.map((f) => {
            const maxX = Math.max(8, window.innerWidth - f.w - 8);
            const maxY = Math.max(8, window.innerHeight - f.h - 8);
            let x = f.x;
            let y = f.y;
            x = snapValue(x, 8);
            y = snapValue(y, 8);
            x = snapValue(x, maxX);
            y = snapValue(y, maxY);
            const c = clampToViewport(x, y, f.w, f.h);
            return { ...f, x: c.x, y: c.y };
        });

        draggingFrameId = null;
        resizingFrameId = null;

        if (draftingFrame) {
            draftingFrame = false;
            if (draftFrameW > 20 && draftFrameH > 20) {
                const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
                frames = [
                    ...frames,
                    {
                        id,
                        title: `Frame ${frames.length + 1}`,
                        x: draftFrameX,
                        y: draftFrameY,
                        w: draftFrameW,
                        h: draftFrameH,
                        locked: false,
                        hidden: false,
                        opacity: 1,
                        flipX: false,
                        flipY: false,
                    },
                ];
                selectedFrameId = id;
                selectedFrameIds = [id];
                selectedEmbedId = null;
                selectedEmbedIds = [];
            }
        }
    };

    const randomBackground = () => {
        const next = bgColors[Math.floor(Math.random() * bgColors.length)];
        backgroundColor = next;
    };

    const applyLightCanvasPreset = () => {
        backgroundColor = "#ffffff";
        strokeColor = "#111111";
    };

    const getRecordingCanvas = () => {
        if (useExcalidrawBridge && excalidrawHostEl) {
            const canvases = Array.from(
                excalidrawHostEl.querySelectorAll("canvas"),
            ) as HTMLCanvasElement[];
            if (canvases.length) {
                canvases.sort(
                    (a, b) => b.width * b.height - a.width * a.height,
                );
                return canvases[0];
            }
        }
        return canvasEl;
    };

    const runRecordPreflight = () => {
        lastPreflightAt = Date.now();
        const recordingCanvas = getRecordingCanvas();
        if (!recordingCanvas) {
            exportNotice = "录制预检失败：画布尚未就绪。";
            exportNoticeLevel = "error";
            return false;
        }

        if (typeof MediaRecorder === "undefined") {
            exportNotice = "录制预检失败：当前浏览器不支持 MediaRecorder。";
            exportNoticeLevel = "error";
            return false;
        }

        if (typeof recordingCanvas.captureStream !== "function") {
            exportNotice =
                "录制预检失败：当前浏览器不支持 canvas.captureStream。";
            exportNoticeLevel = "error";
            return false;
        }

        const mime = pickRecorderMime();
        if (!mime) return false;

        if (includeMicAudio && micDevices.length === 0) {
            exportNotice = "录制预检失败：未检测到麦克风设备。";
            exportNoticeLevel = "error";
            return false;
        }

        exportNotice = `录制预检通过：${mime}${showCameraInRecord ? " + 摄像头" : ""}${includeMicAudio ? " + 麦克风" : ""}`;
        exportNoticeLevel = "info";
        return true;
    };

    const pickRecorderMime = () => {
        const webmCandidates = [
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8",
            "video/webm",
        ];
        const mp4Candidates = [
            "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
            "video/mp4",
        ];

        const preferred =
            exportFormat === "mp4" ? mp4Candidates : webmCandidates;
        const fallback =
            exportFormat === "mp4" ? webmCandidates : mp4Candidates;

        exportNotice = "";
        exportNoticeLevel = "info";

        for (const m of preferred) {
            if (MediaRecorder.isTypeSupported(m)) {
                selectedMimeType = m;
                return m;
            }
        }
        for (const m of fallback) {
            if (MediaRecorder.isTypeSupported(m)) {
                selectedMimeType = m;
                if (exportFormat === "mp4" && m.includes("webm")) {
                    exportNotice = "当前浏览器不支持 MP4 录制，已回退为 WebM。";
                    exportNoticeLevel = "warn";
                } else if (exportFormat === "webm" && m.includes("mp4")) {
                    exportNotice = "当前浏览器不支持 WebM 录制，已回退为 MP4。";
                    exportNoticeLevel = "warn";
                }
                return m;
            }
        }
        selectedMimeType = "";
        exportNotice = "当前浏览器不支持可用录制编码，可能无法开始录制。";
        exportNoticeLevel = "error";
        return "";
    };

    const triggerRecordStart = async () => {
        if (isRecording || isRecordingStarting || isRecordingStopping) return;
        if (!runRecordPreflight()) return;
        // 倒计时期间预先请求摄像头权限，避免录制开始时权限弹窗导致画面缺失
        if (showCameraInRecord) {
            try {
                await ensureCameraStream();
                clampCameraOverlayIntoSlide();
            } catch {}
        }
        if (includeMicAudio) {
            exportNotice = "将录制麦克风声音，请确认浏览器已授权麦克风。";
            exportNoticeLevel = "info";
        }
        if (!enableRecordCountdown || recordCountdownSeconds <= 0) {
            await startRecord();
            return;
        }
        recordCountdownLeft = recordCountdownSeconds;
        const t = window.setInterval(async () => {
            recordCountdownLeft -= 1;
            if (recordCountdownLeft <= 0) {
                clearInterval(t);
                recordCountdownLeft = 0;
                await startRecord();
            }
        }, 1000);
    };

    const clearStopTimer = () => {
        if (recorderStopTimer) {
            clearTimeout(recorderStopTimer);
            recorderStopTimer = null;
        }
    };

    const startRecord = async () => {
        if (isRecording || isRecordingStarting || isRecordingStopping) return;
        isRecordingStarting = true;
        clearStopTimer();
        stopHandled = false;
        clampCameraOverlayIntoSlide();

        // only canvas stream is recorded; toolbar/teleprompter DOM won't be captured
        const recordingCanvas = getRecordingCanvas();
        if (
            !recordingCanvas ||
            typeof recordingCanvas.captureStream !== "function"
        ) {
            exportNotice = "录制启动失败：画布流不可用。";
            exportNoticeLevel = "error";
            isRecordingStarting = false;
            return;
        }
        let recordingSurface: HTMLCanvasElement = recordingCanvas;
        if (useExcalidrawBridge && showCameraInRecord) {
            try {
                recordingSurface =
                    await startBridgeCompositeLoop(recordingCanvas);
            } catch (e) {
                console.warn("bridge camera composite failed", e);
                exportNotice = "摄像头叠加失败：将仅录制白板内容。";
                exportNoticeLevel = "warn";
            }
        }
        const canvasStream = recordingSurface.captureStream(60);
        const stream = new MediaStream();
        for (const t of canvasStream.getVideoTracks()) {
            t.onended = () => {
                if (!isRecording || isRecordingStopping) return;
                exportNotice = "画面轨道意外中断，正在自动停止录制。";
                exportNoticeLevel = "warn";
                stopRecord("video-ended");
            };
            stream.addTrack(t);
        }

        if (includeMicAudio) {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: selectedMicDeviceId
                        ? { deviceId: { ideal: selectedMicDeviceId } }
                        : {
                              echoCancellation: true,
                              noiseSuppression: true,
                              autoGainControl: true,
                          },
                    video: false,
                });

                const AC =
                    window.AudioContext ||
                    (
                        window as unknown as {
                            webkitAudioContext?: typeof AudioContext;
                        }
                    ).webkitAudioContext;
                if (AC) {
                    micAudioCtx = new AC();
                    const source =
                        micAudioCtx.createMediaStreamSource(micStream);
                    micDest = micAudioCtx.createMediaStreamDestination();
                    source.connect(micDest);
                    for (const t of micDest.stream.getAudioTracks()) {
                        t.onended = () => {
                            if (!isRecording) return;
                            exportNotice =
                                "麦克风轨道已中断，后续录制将无音频。";
                            exportNoticeLevel = "warn";
                        };
                        stream.addTrack(t);
                    }
                } else {
                    for (const t of micStream.getAudioTracks()) {
                        t.onended = () => {
                            if (!isRecording) return;
                            exportNotice =
                                "麦克风轨道已中断，后续录制将无音频。";
                            exportNoticeLevel = "warn";
                        };
                        stream.addTrack(t);
                    }
                }
            } catch (e) {
                console.warn("mic capture failed", e);
                exportNotice = "麦克风不可用：将仅录制画面。";
                exportNoticeLevel = "warn";
            }
        }
        const mime = pickRecorderMime();

        chunks = [];
        try {
            recorder = mime
                ? new MediaRecorder(stream, { mimeType: mime })
                : new MediaRecorder(stream);
        } catch (err) {
            exportNotice = "录制器初始化失败，请切换导出格式或更换浏览器。";
            exportNoticeLevel = "error";
            stopMicStream();
            isRecordingStarting = false;
            return;
        }

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                chunks.push(event.data);
                lastChunkAt = Date.now();
            }
        };

        recorder.onerror = () => {
            recordingStopCause = "recorder-error";
            exportNotice = "录制器发生错误，正在尝试安全停止并导出。";
            exportNoticeLevel = "error";
            try {
                recorder?.requestData();
            } catch {}
            window.setTimeout(() => {
                try {
                    recorder?.stop();
                } catch {}
            }, 80);
        };

        recorder.onstop = () => {
            if (stopHandled) return;
            stopHandled = true;
            clearStopTimer();

            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            isRecording = false;
            isRecordPaused = false;
            isRecordingStopping = false;
            if (cameraRenderRaf) cancelAnimationFrame(cameraRenderRaf);
            cameraRenderRaf = 0;
            stopCameraStream();
            stopBridgeComposite();
            stopMicStream();

            if (!chunks.length) {
                exportNotice = "未生成可导出片段，请重试录制。";
                exportNoticeLevel = "error";
                return;
            }
            const actualType =
                recorder?.mimeType || selectedMimeType || "video/webm";
            const ext = actualType.includes("mp4") ? "mp4" : "webm";
            const blob = new Blob(chunks, { type: actualType });
            if (blob.size < 32 * 1024) {
                exportNotice = "录制文件过小，可能录制时长过短或被中断。";
                exportNoticeLevel = "warn";
            }
            downloadRecordingBlob(blob, ext);
            const staleChunkMs = lastChunkAt ? Date.now() - lastChunkAt : 0;
            const staleChunk = lastChunkMs > 3000;
            const causeLabel =
                recordingStopCause === "user"
                    ? "手动停止"
                    : recordingStopCause === "pagehide"
                      ? "页面切后台"
                      : recordingStopCause === "video-ended"
                        ? "画面轨道中断"
                        : recordingStopCause === "recorder-error"
                          ? "录制器错误"
                          : recordingStopCause === "timeout"
                            ? "停止超时收尾"
                            : "未知原因";
            exportNotice = `导出完成：${ext.toUpperCase()} (${Math.round(blob.size / 1024)} KB) · 停止原因：${causeLabel}${staleChunk ? `，末段数据可能不完整（${Math.round(staleChunkMs / 1000)}s 无新片段）` : ""}`;
            exportNoticeLevel =
                staleChunk || recordingStopCause !== "user" ? "warn" : "info";
        };

        try {
            recordingStopCause = "unknown";
            recorder.start(300);
            isRecording = true;
            isRecordPaused = false;
            const hasAudioTrack = stream.getAudioTracks().length > 0;
            exportNotice = hasAudioTrack
                ? "录制已开始（含麦克风）。"
                : "录制已开始（当前无音轨）。";
            exportNoticeLevel = hasAudioTrack ? "info" : "warn";
        } catch {
            exportNotice = "录制启动失败，请检查浏览器权限与编码支持。";
            exportNoticeLevel = "error";
            stopMicStream();
            isRecordingStarting = false;
            return;
        }
        if (showCameraInRecord && !useExcalidrawBridge) {
            try {
                await startCameraRenderLoop();
            } catch (e) {
                console.error("camera start failed", e);
                exportNotice = "摄像头开启失败：将仅录制白板内容。";
                exportNoticeLevel = "warn";
            }
        }
        recordDuration = 0;
        timer = setInterval(() => {
            if (!isRecordPaused) recordDuration += 1;
        }, 1000);
        isRecordingStarting = false;
    };

    const stopRecord = (
        cause:
            | "user"
            | "pagehide"
            | "video-ended"
            | "recorder-error"
            | "unknown" = "user",
    ) => {
        if (!recorder || recorder.state === "inactive" || isRecordingStopping)
            return;
        if (recorder.state !== "recording" && recorder.state !== "paused")
            return;
        recordingStopCause = cause;
        isRecordingStopping = true;

        try {
            recorder.requestData();
        } catch {}
        window.setTimeout(() => {
            try {
                recorder?.requestData();
            } catch {}
        }, 120);

        try {
            recorder.stop();
        } catch {
            isRecordingStopping = false;
            exportNotice = "停止录制失败，请重试。";
            exportNoticeLevel = "error";
            return;
        }

        if (cameraRenderRaf) cancelAnimationFrame(cameraRenderRaf);
        cameraRenderRaf = 0;

        clearStopTimer();
        recorderStopTimer = window.setTimeout(() => {
            if (isRecordingStopping && !stopHandled) {
                isRecordingStopping = false;
                isRecording = false;
                recordingStopCause = "timeout";
                stopBridgeComposite();
                stopCameraStream();
                stopMicStream();
                exportNotice = "停止录制超时，已强制收尾。";
                exportNoticeLevel = "warn";
            }
        }, 3200);
    };

    const togglePauseRecord = () => {
        if (!recorder || recorder.state === "inactive") return;
        if (recorder.state === "recording") {
            try {
                recorder.pause();
                isRecordPaused = true;
            } catch {
                exportNotice = "当前浏览器不支持暂停录制。";
                exportNoticeLevel = "warn";
            }
            return;
        }
        if (recorder.state === "paused") {
            try {
                recorder.resume();
                isRecordPaused = false;
            } catch {
                exportNotice = "当前浏览器不支持恢复录制。";
                exportNoticeLevel = "warn";
            }
        }
    };

    const downloadRecordingBlob = (blob: Blob, ext: "webm" | "mp4") => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `videorecord-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    };

    const formatDuration = (sec: number) => {
        const m = String(Math.floor(sec / 60)).padStart(2, "0");
        const s = String(sec % 60).padStart(2, "0");
        return `${m}:${s}`;
    };

    const resetTeleprompterPosition = () => {
        teleprompterScrollTop = 0;
        if (teleprompterTextEl) teleprompterTextEl.scrollTop = 0;
    };

    const stopTeleprompter = () => {
        isTeleprompterRunning = false;
        teleprompterLastTs = 0;
        if (teleprompterRaf) cancelAnimationFrame(teleprompterRaf);
        teleprompterRaf = 0;
    };

    const runTeleprompter = (ts: number) => {
        if (!isTeleprompterRunning || !teleprompterTextEl) return;

        if (!teleprompterLastTs) teleprompterLastTs = ts;
        const dt = (ts - teleprompterLastTs) / 1000;
        teleprompterLastTs = ts;

        teleprompterScrollTop += teleprompterSpeed * dt;

        const maxScroll = Math.max(
            0,
            teleprompterTextEl.scrollHeight - teleprompterTextEl.clientHeight,
        );

        if (teleprompterScrollTop >= maxScroll) {
            teleprompterScrollTop = maxScroll;
            teleprompterTextEl.scrollTop = teleprompterScrollTop;
            stopTeleprompter();
            return;
        }

        teleprompterTextEl.scrollTop = teleprompterScrollTop;
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
        if (draggingTeleprompter) {
            teleprompterOffsetX = dragBaseX + (e.clientX - dragStartX);
            teleprompterOffsetY = dragBaseY + (e.clientY - dragStartY);
        }
        if (draggingFloatingControls) {
            floatingControlsX = fcDragBaseX + (e.clientX - fcDragStartX);
            floatingControlsY = fcDragBaseY + (e.clientY - fcDragStartY);
        }
        if (draggingCameraOverlay) {
            const dx = e.clientX - cameraDragStartX;
            const dy = e.clientY - cameraDragStartY;
            const maxX = Math.max(0, cameraDragSurfaceW - cameraDragSize);
            const maxY = Math.max(0, cameraDragSurfaceH - cameraDragSize);
            const nextX = Math.max(0, Math.min(maxX, cameraDragBaseX + dx));
            const nextY = Math.max(0, Math.min(maxY, cameraDragBaseY + dy));
            const { baseX, baseY } = getCameraBasePosition(
                cameraDragSurfaceW,
                cameraDragSurfaceH,
                cameraDragSize,
            );
            cameraOffsetX = Math.round(nextX - baseX);
            cameraOffsetY = Math.round(nextY - baseY);
        }
    };

    const onWindowPointerUp = () => {
        if (draggingTeleprompter) {
            draggingTeleprompter = false;
            clampAndSnapTeleprompter();
            persistTeleprompterPrefs();
        }
        if (draggingFloatingControls) {
            draggingFloatingControls = false;
        }
        if (draggingCameraOverlay) {
            draggingCameraOverlay = false;
            clampCameraOverlayIntoSlide();
        }
    };

    $: if (teleprompterHydrated) {
        persistTeleprompterPrefs();
    }

    $: autosaveSignature = `${activeSlide}|${slides.length}|${(slides[activeSlide] || "").length}|${bridgeSlides.length}|${bridgeSlides[activeSlide]?.elements?.length ?? 0}|${frames.length}|${webEmbeds.length}|${aspectRatio}|${backgroundColor}|${canvasCornerRadius}|${canvasInnerPadding}`;

    $: if (typeof window !== "undefined" && autosaveSignature) {
        // throttled autosave for both whiteboard runtimes
        scheduleProjectAutosave();
    }

    $: if (cameraPreviewEl) {
        if (cameraStream) {
            if (cameraPreviewEl.srcObject !== cameraStream) {
                cameraPreviewEl.srcObject = cameraStream;
            }
            if (cameraPreviewEl.paused) {
                void cameraPreviewEl.play().catch(() => {});
            }
        } else if (cameraPreviewEl.srcObject) {
            cameraPreviewEl.srcObject = null;
        }
    }

    $: if (isRecording && showCameraInRecord) {
        activeSlide;
        cameraCorner;
        cameraMargin;
        cameraSize;
        requestAnimationFrame(() => clampCameraOverlayIntoSlide());
    }

    const toggleFrameSelection = (id: string, additive: boolean) => {
        if (!additive) {
            selectedFrameIds = [id];
            selectedFrameId = id;
            selectedEmbedIds = [];
            selectedEmbedId = null;
            return;
        }

        if (selectedFrameIds.includes(id)) {
            selectedFrameIds = selectedFrameIds.filter((x) => x !== id);
        } else {
            selectedFrameIds = [...selectedFrameIds, id];
        }
        selectedFrameId = selectedFrameIds[0] || null;
    };

    const toggleEmbedSelection = (id: string, additive: boolean) => {
        if (!additive) {
            selectedEmbedIds = [id];
            selectedEmbedId = id;
            selectedFrameIds = [];
            selectedFrameId = null;
            return;
        }

        if (selectedEmbedIds.includes(id)) {
            selectedEmbedIds = selectedEmbedIds.filter((x) => x !== id);
        } else {
            selectedEmbedIds = [...selectedEmbedIds, id];
        }
        selectedEmbedId = selectedEmbedIds[0] || null;
    };

    const clearAllSelections = () => {
        selectedFrameId = null;
        selectedEmbedId = null;
        selectedFrameIds = [];
        selectedEmbedIds = [];
    };

    const selectAllVisibleObjects = () => {
        selectedFrameIds = frames.filter((f) => !f.hidden).map((f) => f.id);
        selectedEmbedIds = webEmbeds.filter((e) => !e.hidden).map((e) => e.id);
        selectedFrameId = selectedFrameIds[0] || null;
        selectedEmbedId = selectedEmbedIds[0] || null;
    };

    const nudgeSelected = (dx: number, dy: number) => {
        if (selectedFrameIds.length) {
            frames = frames.map((f) => {
                if (!selectedFrameIds.includes(f.id) || f.locked) return f;
                const c = clampToViewport(f.x + dx, f.y + dy, f.w, f.h);
                return { ...f, x: c.x, y: c.y };
            });
        }

        if (selectedEmbedIds.length) {
            webEmbeds = webEmbeds.map((em) => {
                if (!selectedEmbedIds.includes(em.id) || em.locked) return em;
                const c = clampToViewport(em.x + dx, em.y + dy, em.w, em.h);
                return { ...em, x: c.x, y: c.y };
            });
        }
    };

    const alignSelectedGroup = (
        mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
    ) => {
        if (selectedFrameIds.length) {
            frames = frames.map((f) => {
                if (!selectedFrameIds.includes(f.id) || f.locked) return f;
                let x = f.x;
                let y = f.y;
                if (mode === "left") x = 8;
                if (mode === "center")
                    x = Math.round((window.innerWidth - f.w) / 2);
                if (mode === "right")
                    x = Math.round(window.innerWidth - f.w - 8);
                if (mode === "top") y = 8;
                if (mode === "middle")
                    y = Math.round((window.innerHeight - f.h) / 2);
                if (mode === "bottom")
                    y = Math.round(window.innerHeight - f.h - 8);
                const c = clampToViewport(x, y, f.w, f.h);
                return { ...f, x: c.x, y: c.y };
            });
        }

        if (selectedEmbedIds.length) {
            webEmbeds = webEmbeds.map((em) => {
                if (!selectedEmbedIds.includes(em.id) || em.locked) return em;
                let x = em.x;
                let y = em.y;
                if (mode === "left") x = 8;
                if (mode === "center")
                    x = Math.round((window.innerWidth - em.w) / 2);
                if (mode === "right")
                    x = Math.round(window.innerWidth - em.w - 8);
                if (mode === "top") y = 8;
                if (mode === "middle")
                    y = Math.round((window.innerHeight - em.h) / 2);
                if (mode === "bottom")
                    y = Math.round(window.innerHeight - em.h - 8);
                const c = clampToViewport(x, y, em.w, em.h);
                return { ...em, x: c.x, y: c.y };
            });
        }
    };

    const copySelection = () => {
        copiedFrames = frames
            .filter((f) => selectedFrameIds.includes(f.id))
            .map((f) => ({ ...f }));
        copiedEmbeds = webEmbeds
            .filter((e) => selectedEmbedIds.includes(e.id))
            .map((e) => ({ ...e }));
    };

    const pasteSelection = () => {
        const now = Date.now();
        const newFrameIds: string[] = [];
        const newEmbedIds: string[] = [];

        if (copiedFrames.length) {
            const created = copiedFrames.map((f, i) => {
                const id = `${now}-f-${i}-${Math.random().toString(16).slice(2, 6)}`;
                newFrameIds.push(id);
                return {
                    ...f,
                    id,
                    x: f.x + 24,
                    y: f.y + 24,
                    title: `${f.title} copy`,
                };
            });
            frames = [...frames, ...created];
        }

        if (copiedEmbeds.length) {
            const created = copiedEmbeds.map((e, i) => {
                const id = `${now}-e-${i}-${Math.random().toString(16).slice(2, 6)}`;
                newEmbedIds.push(id);
                return { ...e, id, x: e.x + 24, y: e.y + 24 };
            });
            webEmbeds = [...webEmbeds, ...created];
        }

        if (newFrameIds.length || newEmbedIds.length) {
            selectedFrameIds = newFrameIds;
            selectedEmbedIds = newEmbedIds;
            selectedFrameId = newFrameIds[0] || null;
            selectedEmbedId = newEmbedIds[0] || null;
        }
    };

    const moveSelectionLayer = (dir: "front" | "back") => {
        if (selectedFrameIds.length) {
            const selected = frames.filter((f) =>
                selectedFrameIds.includes(f.id),
            );
            const others = frames.filter(
                (f) => !selectedFrameIds.includes(f.id),
            );
            frames =
                dir === "front"
                    ? [...others, ...selected]
                    : [...selected, ...others];
        }

        if (selectedEmbedIds.length) {
            const selected = webEmbeds.filter((e) =>
                selectedEmbedIds.includes(e.id),
            );
            const others = webEmbeds.filter(
                (e) => !selectedEmbedIds.includes(e.id),
            );
            webEmbeds =
                dir === "front"
                    ? [...others, ...selected]
                    : [...selected, ...others];
        }
    };

    const moveSelectionLayerStep = (delta: -1 | 1) => {
        if (selectedFrameIds.length) {
            const arr = [...frames];
            if (delta > 0) {
                for (let i = arr.length - 2; i >= 0; i--) {
                    const a = arr[i];
                    const b = arr[i + 1];
                    if (
                        selectedFrameIds.includes(a.id) &&
                        !selectedFrameIds.includes(b.id)
                    ) {
                        arr[i] = b;
                        arr[i + 1] = a;
                    }
                }
            } else {
                for (let i = 1; i < arr.length; i++) {
                    const a = arr[i - 1];
                    const b = arr[i];
                    if (
                        !selectedFrameIds.includes(a.id) &&
                        selectedFrameIds.includes(b.id)
                    ) {
                        arr[i - 1] = b;
                        arr[i] = a;
                    }
                }
            }
            frames = arr;
        }

        if (selectedEmbedIds.length) {
            const arr = [...webEmbeds];
            if (delta > 0) {
                for (let i = arr.length - 2; i >= 0; i--) {
                    const a = arr[i];
                    const b = arr[i + 1];
                    if (
                        selectedEmbedIds.includes(a.id) &&
                        !selectedEmbedIds.includes(b.id)
                    ) {
                        arr[i] = b;
                        arr[i + 1] = a;
                    }
                }
            } else {
                for (let i = 1; i < arr.length; i++) {
                    const a = arr[i - 1];
                    const b = arr[i];
                    if (
                        !selectedEmbedIds.includes(a.id) &&
                        selectedEmbedIds.includes(b.id)
                    ) {
                        arr[i - 1] = b;
                        arr[i] = a;
                    }
                }
            }
            webEmbeds = arr;
        }
    };

    const resizeSelectedBy = (ratio: number) => {
        if (selectedFrameIds.length) {
            frames = frames.map((f) => {
                if (!selectedFrameIds.includes(f.id) || f.locked) return f;
                const w = Math.max(120, Math.round(f.w * ratio));
                const h = Math.max(80, Math.round(f.h * ratio));
                const c = clampToViewport(f.x, f.y, w, h);
                return { ...f, w, h, x: c.x, y: c.y };
            });
        }

        if (selectedEmbedIds.length) {
            webEmbeds = webEmbeds.map((e) => {
                if (!selectedEmbedIds.includes(e.id) || e.locked) return e;
                const w = Math.max(220, Math.round(e.w * ratio));
                const h = Math.max(140, Math.round(e.h * ratio));
                const c = clampToViewport(e.x, e.y, w, h);
                return { ...e, w, h, x: c.x, y: c.y };
            });
        }
    };

    const setSelectedLock = (locked: boolean) => {
        if (selectedFrameIds.length) {
            frames = frames.map((f) =>
                selectedFrameIds.includes(f.id) ? { ...f, locked } : f,
            );
        }
        if (selectedEmbedIds.length) {
            webEmbeds = webEmbeds.map((e) =>
                selectedEmbedIds.includes(e.id) ? { ...e, locked } : e,
            );
        }
    };

    const setSelectedVisibility = (hidden: boolean) => {
        if (selectedFrameIds.length) {
            frames = frames.map((f) =>
                selectedFrameIds.includes(f.id) ? { ...f, hidden } : f,
            );
        }
        if (selectedEmbedIds.length) {
            webEmbeds = webEmbeds.map((e) =>
                selectedEmbedIds.includes(e.id) ? { ...e, hidden } : e,
            );
        }
    };

    const unhideAllObjects = () => {
        frames = frames.map((f) => ({ ...f, hidden: false }));
        webEmbeds = webEmbeds.map((e) => ({ ...e, hidden: false }));
    };

    const flipSelected = (axis: "x" | "y") => {
        if (selectedFrameIds.length) {
            frames = frames.map((f) => {
                if (!selectedFrameIds.includes(f.id) || f.locked) return f;
                return axis === "x"
                    ? { ...f, flipX: !(f.flipX ?? false) }
                    : { ...f, flipY: !(f.flipY ?? false) };
            });
        }
        if (selectedEmbedIds.length) {
            webEmbeds = webEmbeds.map((e) => {
                if (!selectedEmbedIds.includes(e.id) || e.locked) return e;
                return axis === "x"
                    ? { ...e, flipX: !(e.flipX ?? false) }
                    : { ...e, flipY: !(e.flipY ?? false) };
            });
        }
    };

    const normalizeSelectedSize = () => {
        const selectedFrames = frames.filter(
            (f) => selectedFrameIds.includes(f.id) && !f.locked,
        );
        const selectedEmbeds = webEmbeds.filter(
            (e) => selectedEmbedIds.includes(e.id) && !e.locked,
        );

        if (selectedFrames.length > 1) {
            const base = selectedFrames[0];
            frames = frames.map((f) => {
                if (!selectedFrameIds.includes(f.id) || f.locked) return f;
                const c = clampToViewport(f.x, f.y, base.w, base.h);
                return { ...f, w: base.w, h: base.h, x: c.x, y: c.y };
            });
        }

        if (selectedEmbeds.length > 1) {
            const base = selectedEmbeds[0];
            webEmbeds = webEmbeds.map((e) => {
                if (!selectedEmbedIds.includes(e.id) || e.locked) return e;
                const c = clampToViewport(e.x, e.y, base.w, base.h);
                return { ...e, w: base.w, h: base.h, x: c.x, y: c.y };
            });
        }
    };

    const distributeSelected = (axis: "x" | "y") => {
        const selectedF = frames.filter(
            (f) => selectedFrameIds.includes(f.id) && !f.locked && !f.hidden,
        );
        if (selectedF.length >= 3) {
            const sorted = [...selectedF].sort((a, b) =>
                axis === "x" ? a.x - b.x : a.y - b.y,
            );
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const span = axis === "x" ? last.x - first.x : last.y - first.y;
            const step = span / (sorted.length - 1);
            const posMap = new Map<string, number>();
            sorted.forEach((item, idx) =>
                posMap.set(
                    item.id,
                    Math.round((axis === "x" ? first.x : first.y) + step * idx),
                ),
            );
            frames = frames.map((f) => {
                const v = posMap.get(f.id);
                if (v == null) return f;
                const c =
                    axis === "x"
                        ? clampToViewport(v, f.y, f.w, f.h)
                        : clampToViewport(f.x, v, f.w, f.h);
                return { ...f, x: c.x, y: c.y };
            });
        }

        const selectedE = webEmbeds.filter(
            (e) => selectedEmbedIds.includes(e.id) && !e.locked && !e.hidden,
        );
        if (selectedE.length >= 3) {
            const sorted = [...selectedE].sort((a, b) =>
                axis === "x" ? a.x - b.x : a.y - b.y,
            );
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const span = axis === "x" ? last.x - first.x : last.y - first.y;
            const step = span / (sorted.length - 1);
            const posMap = new Map<string, number>();
            sorted.forEach((item, idx) =>
                posMap.set(
                    item.id,
                    Math.round((axis === "x" ? first.x : first.y) + step * idx),
                ),
            );
            webEmbeds = webEmbeds.map((e) => {
                const v = posMap.get(e.id);
                if (v == null) return e;
                const c =
                    axis === "x"
                        ? clampToViewport(v, e.y, e.w, e.h)
                        : clampToViewport(e.x, v, e.w, e.h);
                return { ...e, x: c.x, y: c.y };
            });
        }
    };

    const toggleFrameLock = (id: string) => {
        frames = frames.map((f) =>
            f.id === id ? { ...f, locked: !f.locked } : f,
        );
    };

    const toggleEmbedLock = (id: string) => {
        webEmbeds = webEmbeds.map((e) =>
            e.id === id ? { ...e, locked: !e.locked } : e,
        );
    };

    const updateFrameProps = (id: string, patch: Partial<FrameItem>) => {
        frames = frames.map((f) => {
            if (f.id !== id) return f;
            const next = { ...f, ...patch };
            const c = clampToViewport(next.x, next.y, next.w, next.h);
            const opacity = Math.max(0.05, Math.min(1, next.opacity ?? 1));
            return { ...next, x: c.x, y: c.y, opacity };
        });
    };

    const updateEmbedProps = (id: string, patch: Partial<WebEmbedItem>) => {
        webEmbeds = webEmbeds.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, ...patch };
            const c = clampToViewport(next.x, next.y, next.w, next.h);
            const opacity = Math.max(0.05, Math.min(1, next.opacity ?? 1));
            return { ...next, x: c.x, y: c.y, opacity };
        });
    };

    const inputValue = (e: Event) =>
        (e.currentTarget as HTMLInputElement).value;
    const inputNumber = (e: Event, fallback = 0) => {
        const n = Number(inputValue(e));
        return Number.isFinite(n) ? n : fallback;
    };

    $: selectionCount = useExcalidrawBridge
        ? 0
        : selectedFrameIds.length + selectedEmbedIds.length;
    $: toolLabel = useExcalidrawBridge
        ? "EX"
        : (
              {
                  select: "🖱️",
                  pen: "✏️",
                  eraser: "🧽",
                  text: "T",
                  line: "／",
                  rect: "▭",
                  circle: "◯",
                  laser: "🔦",
                  frame: "▣",
                  webembed: "🌐",
              } as Record<string, string>
          )[tool] || tool;

    $: saveAgeText = lastProjectSaveAt
        ? `${Math.max(0, Math.floor((Date.now() - lastProjectSaveAt) / 1000))}s`
        : "--";
    $: hiddenFrames = frames.filter((f) => f.hidden);
    $: hiddenEmbeds = webEmbeds.filter((e) => e.hidden);

    $: boardCursor =
        tool === "text"
            ? "text"
            : tool === "select"
              ? slideDragging
                  ? "grabbing"
                  : "grab"
              : tool === "laser"
                ? "crosshair"
                : "crosshair";

    $: if (useExcalidrawBridge && excalidrawHostEl) {
        void mountExcalidrawBridge();
    }

    $: if (!useExcalidrawBridge) {
        unmountExcalidrawBridge();
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
        if (!isRecording) return;
        e.preventDefault();
        e.returnValue = "录制进行中，离开页面会中断并可能丢失导出。";
    };

    const onPageHide = () => {
        if (!isRecording || isRecordingStopping) return;
        exportNotice = "页面进入后台，已自动停止录制以保护文件完整性。";
        exportNoticeLevel = "warn";
        stopRecord("pagehide");
    };

    const onGlobalKeydown = (e: KeyboardEvent) => {
        if (textEditing) return;

        if (useExcalidrawBridge) {
            if (e.code === "Space" || e.key.toLowerCase() === "p") {
                e.preventDefault();
                if (isRecording) stopRecord();
                else void triggerRecordStart();
                return;
            }
            if (e.key.toLowerCase() === "k") {
                e.preventDefault();
                if (isRecording) togglePauseRecord();
                return;
            }
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redo();
            return;
        }

        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            e.target instanceof HTMLSelectElement
        ) {
            return;
        }

        if (e.key === "Delete" || e.key === "Backspace") {
            if (selectedFrameIds.length) {
                for (const id of [...selectedFrameIds]) removeFrame(id);
                selectedFrameIds = [];
                selectedFrameId = null;
                return;
            }
            if (selectedEmbedIds.length) {
                for (const id of [...selectedEmbedIds]) removeWebEmbed(id);
                selectedEmbedIds = [];
                selectedEmbedId = null;
                return;
            }
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
            e.preventDefault();
            selectAllVisibleObjects();
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
            e.preventDefault();
            copySelection();
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
            e.preventDefault();
            pasteSelection();
            return;
        }

        if (
            (e.metaKey || e.ctrlKey) &&
            e.shiftKey &&
            e.key.toLowerCase() === "d"
        ) {
            e.preventDefault();
            duplicateSlide();
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
            e.preventDefault();
            copySelection();
            pasteSelection();
            return;
        }

        if (e.key === "]") {
            if (e.metaKey || e.ctrlKey) {
                moveSelectionLayerStep(1);
            } else {
                moveSelectionLayer("front");
            }
            return;
        }
        if (e.key === "[") {
            if (e.metaKey || e.ctrlKey) {
                moveSelectionLayerStep(-1);
            } else {
                moveSelectionLayer("back");
            }
            return;
        }

        if (
            ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
            const step = e.metaKey || e.ctrlKey ? 50 : e.shiftKey ? 10 : 1;
            let dx = 0;
            let dy = 0;
            if (e.key === "ArrowUp") dy = -step;
            if (e.key === "ArrowDown") dy = step;
            if (e.key === "ArrowLeft") dx = -step;
            if (e.key === "ArrowRight") dx = step;

            if (selectedFrameIds.length || selectedEmbedIds.length) {
                e.preventDefault();
                nudgeSelected(dx, dy);
                return;
            }
        }

        if (e.key === "Escape") {
            clearAllSelections();
            return;
        }

        if (e.key.toLowerCase() === "h") {
            if (selectedFrameIds.length || selectedEmbedIds.length) {
                const anyVisible =
                    frames.some(
                        (f) => selectedFrameIds.includes(f.id) && !f.hidden,
                    ) ||
                    webEmbeds.some(
                        (e) => selectedEmbedIds.includes(e.id) && !e.hidden,
                    );
                setSelectedVisibility(anyVisible);
                return;
            }
        }

        if (e.code === "Space" || e.key.toLowerCase() === "p") {
            e.preventDefault();
            if (isRecording) stopRecord();
            else triggerRecordStart();
            return;
        }

        if (e.key.toLowerCase() === "k") {
            e.preventDefault();
            if (isRecording) togglePauseRecord();
            return;
        }

        const key = e.key.toLowerCase();
        if (key === "v") tool = "pen";
        if (key === "e") tool = "eraser";
        if (key === "t") tool = "text";
        if (key === "l") tool = "line";
        if (key === "r") tool = "rect";
        if (key === "c") tool = "circle";
        if (key === "f") tool = "frame";
    };
</script>

<svelte:window
    on:keydown={onGlobalKeydown}
    on:beforeunload={onBeforeUnload}
    on:pagehide={onPageHide}
    on:pointermove={onWindowPointerMove}
    on:pointerup={onWindowPointerUp}
/>

<svelte:head>
    <title>Video Record Whiteboard</title>
</svelte:head>

<div class="page">
    <input
        bind:this={imageInputEl}
        type="file"
        accept="image/*"
        class="hidden-file-input"
        on:change={onImageSelected}
    />

    <div
        bind:this={boardWrapEl}
        class="board-wrap"
        class:recording-slide-focus={isRecording ||
            isRecordingStarting ||
            recordCountdownLeft > 0}
        style={`aspect-ratio:${boardAspectRatio}; background:${backgroundColor}; border-radius:${canvasCornerRadius}px; padding:${canvasInnerPadding}px;`}
    >
        <canvas
            bind:this={canvasEl}
            class="board"
            style={`cursor:${boardCursor}; opacity:${useExcalidrawBridge ? 0 : 1};`}
            on:pointerenter={enterBoard}
            on:pointerdown={beginDraw}
            on:pointermove={draw}
            on:pointerup={endDraw}
            on:pointercancel={endDraw}
            on:pointerleave={(e) => {
                endDraw(e);
                leaveBoard();
            }}
        />

        {#if useExcalidrawBridge}
            <div class="excalidraw-host" bind:this={excalidrawHostEl}></div>
        {/if}

        <!-- Slide 标题（对标 Excalicord） -->
        <div class="slide-title-overlay">Slide {activeSlide + 1}</div>

        {#if isRecording && showCameraInRecord && cameraStream}
            <div
                class="camera-overlay"
                class:dragging={draggingCameraOverlay}
                style={getCameraOverlayStyle()}
                role="button"
                aria-label="drag camera overlay"
                tabindex="-1"
                on:pointerdown={startDragCameraOverlay}
            >
                <video
                    bind:this={cameraPreviewEl}
                    autoplay
                    muted
                    playsinline
                    style={`transform:${cameraMirror ? "scaleX(-1)" : "none"};`}
                ></video>
            </div>
        {/if}

        {#if !useExcalidrawBridge && showGuideV}
            <div class="snap-guide-v" style={`left:${guideVX}px;`}></div>
        {/if}
        {#if !useExcalidrawBridge && showGuideH}
            <div class="snap-guide-h" style={`top:${guideHY}px;`}></div>
        {/if}

        {#if !useExcalidrawBridge && marqueeSelecting && marqueeW > 0 && marqueeH > 0}
            <div
                class="marquee-box"
                style={`left:${marqueeX}px; top:${marqueeY}px; width:${marqueeW}px; height:${marqueeH}px;`}
            ></div>
        {/if}

        {#if !useExcalidrawBridge && textEditing}
            <textarea
                bind:this={textAreaEl}
                class="canvas-text-input"
                style={`left:${textInputX}px; top:${textInputY}px; font-size:${textFontSize}px; color:${strokeColor};`}
                bind:value={textInputValue}
                placeholder="输入文字，Ctrl/Cmd+Enter 确认"
                on:keydown={onTextInputKeydown}
                on:blur={commitTextToCanvas}
            />
        {/if}

        {#if !useExcalidrawBridge && tool === "laser" && cursorInside && laserPressed}
            <div
                class="laser-dot"
                style={`left:${cursorX}px; top:${cursorY}px; width:${laserSize}px; height:${laserSize}px; background:${laserColor};`}
            ></div>
        {/if}

        {#if showCursorHighlight && cursorInside && isRecording}
            <div
                class="cursor-highlight"
                style={`left:${cursorX}px; top:${cursorY}px; width:${cursorHighlightSize}px; height:${cursorHighlightSize}px; background:${cursorHighlightColor};`}
            ></div>
        {/if}

        <div
            class="floating-controls"
            style={`transform:translate(${floatingControlsX}px, ${floatingControlsY}px);`}
        >
            <div
                class="fc-drag-handle"
                on:pointerdown={startDragFloatingControls}
                title="拖拽移动工具栏"
            >
                ⠿
            </div>
            <button class="floating-btn" on:click={() => (showSettings = true)}
                >⚙</button
            >
            <button
                class="floating-btn"
                class:active={showTeleprompter}
                on:click={() => (showTeleprompter = !showTeleprompter)}
                >📝</button
            >
            {#if !useExcalidrawBridge}
                <button
                    class="floating-btn"
                    on:click={saveProjectSnapshot}
                    title="保存项目">💾</button
                >
                <button
                    class="floating-btn"
                    on:click={loadProjectSnapshot}
                    title="恢复项目">⟲</button
                >
            {/if}
            <button
                class="floating-btn"
                on:click={() => (showShortcutsHelp = !showShortcutsHelp)}
                title="快捷键帮助">⌨</button
            >
            {#if !isRecording}
                <button
                    class="floating-record"
                    on:click={triggerRecordStart}
                    disabled={isRecordingStarting ||
                        isRecordingStopping ||
                        recordCountdownLeft > 0}
                    >{isRecordingStarting
                        ? "… 启动中"
                        : recordCountdownLeft > 0
                          ? `倒计时 ${recordCountdownLeft}`
                          : "● 录制"}</button
                >
            {:else}
                <button
                    class="floating-pause"
                    on:click={togglePauseRecord}
                    disabled={isRecordingStopping}
                    >{isRecordPaused ? "▶ 继续" : "⏸ 暂停"}</button
                >
                <button
                    class="floating-stop"
                    on:click={stopRecord}
                    disabled={isRecordingStopping}
                    >{isRecordingStopping
                        ? "… 停止中"
                        : `■ 停止 ${formatDuration(recordDuration)}`}</button
                >
            {/if}
        </div>

        {#if recordCountdownLeft > 0}
            <div class="countdown-overlay">
                <span class="countdown-number" key={recordCountdownLeft}
                    >{recordCountdownLeft}</span
                >
            </div>
        {/if}

        {#if !useExcalidrawBridge && draftingFrame}
            <div
                class="frame-item draft"
                style={`left:${draftFrameX}px; top:${draftFrameY}px; width:${draftFrameW}px; height:${draftFrameH}px;`}
            >
                <div class="frame-head"><span>Frame</span></div>
            </div>
        {/if}

        {#if !useExcalidrawBridge}{#each frames.filter((f) => !f.hidden) as frame (frame.id)}
                <div
                    class="frame-item"
                    class:selected={selectedFrameIds.includes(frame.id)}
                    class:locked={!!frame.locked}
                    style={`left:${frame.x}px; top:${frame.y}px; width:${frame.w}px; height:${frame.h}px;`}
                    role="button"
                    aria-label="select frame"
                    tabindex="-1"
                    on:pointerdown={(e) =>
                        toggleFrameSelection(frame.id, e.shiftKey)}
                >
                    <div
                        class="frame-head"
                        on:pointerdown={(e) => startDragFrame(frame.id, e)}
                    >
                        <span>{frame.title}</span>
                        <div class="frame-actions">
                            <button on:click={() => toggleFrameLock(frame.id)}
                                >{frame.locked ? "🔒" : "🔓"}</button
                            ><button
                                on:click={() =>
                                    updateFrameProps(frame.id, {
                                        hidden: !frame.hidden,
                                    })}>{frame.hidden ? "🙈" : "👁"}</button
                            ><button
                                on:click={() => moveFrameLayer(frame.id, -1)}
                                >↓</button
                            ><button
                                on:click={() => moveFrameLayer(frame.id, 1)}
                                >↑</button
                            ><button on:click={() => removeFrame(frame.id)}
                                >✕</button
                            >
                        </div>
                    </div>
                    <div
                        class="frame-resize"
                        on:pointerdown={(e) => startResizeFrame(frame.id, e)}
                    ></div>
                </div>
            {/each}{/if}

        {#if !useExcalidrawBridge && selectedFrameIds.length + selectedEmbedIds.length > 1}
            <div class="floating-edit-panel group-panel">
                <div class="edit-title">
                    批量编辑（{selectedFrameIds.length +
                        selectedEmbedIds.length}）
                </div>
                <div class="edit-grid">
                    <button on:click={() => alignSelectedGroup("left")}
                        >左</button
                    >
                    <button on:click={() => alignSelectedGroup("center")}
                        >中</button
                    >
                    <button on:click={() => alignSelectedGroup("right")}
                        >右</button
                    >
                    <button on:click={() => alignSelectedGroup("top")}
                        >上</button
                    >
                    <button on:click={() => alignSelectedGroup("middle")}
                        >中</button
                    >
                    <button on:click={() => alignSelectedGroup("bottom")}
                        >下</button
                    >
                    <button on:click={() => distributeSelected("x")}
                        >横向均分</button
                    >
                    <button on:click={() => distributeSelected("y")}
                        >纵向均分</button
                    >
                </div>
                <div class="edit-grid small-grid">
                    <button on:click={() => moveSelectionLayer("back")}
                        >置底</button
                    >
                    <button on:click={() => moveSelectionLayer("front")}
                        >置顶</button
                    >
                    <button on:click={() => moveSelectionLayerStep(-1)}
                        >下移一层</button
                    >
                    <button on:click={() => moveSelectionLayerStep(1)}
                        >上移一层</button
                    >
                    <button on:click={copySelection}>复制</button>
                    <button on:click={() => resizeSelectedBy(0.9)}>缩小</button>
                    <button on:click={() => resizeSelectedBy(1.1)}>放大</button>
                    <button on:click={normalizeSelectedSize}>同尺寸</button>
                    <button on:click={() => setSelectedLock(true)}>锁定</button>
                    <button on:click={() => setSelectedLock(false)}>解锁</button
                    >
                    <button on:click={() => setSelectedVisibility(true)}
                        >隐藏</button
                    >
                    <button on:click={() => setSelectedVisibility(false)}
                        >显示</button
                    >
                    <button on:click={() => flipSelected("x")}>水平翻转</button>
                    <button on:click={() => flipSelected("y")}>垂直翻转</button>
                    <button on:click={() => nudgeSelected(0, 0)}>刷新</button>
                    <button on:click={selectAllVisibleObjects}>全选可见</button>
                </div>
            </div>
        {/if}

        {#if !useExcalidrawBridge && selectedFrameId && selectedFrameIds.length <= 1}
            <div class="floating-edit-panel">
                <div class="edit-title">Frame 编辑</div>
                <div class="edit-grid">
                    <button on:click={() => alignSelectedFrame("left")}
                        >左</button
                    >
                    <button on:click={() => alignSelectedFrame("center")}
                        >中</button
                    >
                    <button on:click={() => alignSelectedFrame("right")}
                        >右</button
                    >
                    <button on:click={() => alignSelectedFrame("top")}
                        >上</button
                    >
                    <button on:click={() => alignSelectedFrame("middle")}
                        >中</button
                    >
                    <button on:click={() => alignSelectedFrame("bottom")}
                        >下</button
                    >
                </div>
            </div>
        {/if}

        {#if !useExcalidrawBridge && selectedEmbedId && selectedEmbedIds.length <= 1}
            <div class="floating-edit-panel embed-panel">
                <div class="edit-title">Embed 编辑</div>
                <div class="edit-grid">
                    <button on:click={() => alignSelectedEmbed("left")}
                        >左</button
                    >
                    <button on:click={() => alignSelectedEmbed("center")}
                        >中</button
                    >
                    <button on:click={() => alignSelectedEmbed("right")}
                        >右</button
                    >
                    <button on:click={() => alignSelectedEmbed("top")}
                        >上</button
                    >
                    <button on:click={() => alignSelectedEmbed("middle")}
                        >中</button
                    >
                    <button on:click={() => alignSelectedEmbed("bottom")}
                        >下</button
                    >
                </div>
                <div class="edit-grid small-grid">
                    <button on:click={() => resizeSelectedEmbedPreset("small")}
                        >S</button
                    >
                    <button on:click={() => resizeSelectedEmbedPreset("medium")}
                        >M</button
                    >
                    <button on:click={() => resizeSelectedEmbedPreset("large")}
                        >L</button
                    >
                </div>
            </div>
        {/if}

        {#if !useExcalidrawBridge && selectedFrameId && selectedFrameIds.length <= 1}
            {#each frames.filter((f) => f.id === selectedFrameId) as f}
                <div class="floating-edit-panel props-panel frame-props">
                    <div class="edit-title">Frame 属性</div>
                    <div class="prop-grid">
                        <label
                            >X<input
                                type="number"
                                value={Math.round(f.x)}
                                on:change={(e) =>
                                    updateFrameProps(f.id, {
                                        x: inputNumber(e, 0),
                                    })}
                            /></label
                        >
                        <label
                            >Y<input
                                type="number"
                                value={Math.round(f.y)}
                                on:change={(e) =>
                                    updateFrameProps(f.id, {
                                        y: inputNumber(e, 0),
                                    })}
                            /></label
                        >
                        <label
                            >W<input
                                type="number"
                                value={Math.round(f.w)}
                                on:change={(e) =>
                                    updateFrameProps(f.id, {
                                        w: Math.max(120, inputNumber(e, 120)),
                                    })}
                            /></label
                        >
                        <label
                            >H<input
                                type="number"
                                value={Math.round(f.h)}
                                on:change={(e) =>
                                    updateFrameProps(f.id, {
                                        h: Math.max(80, inputNumber(e, 80)),
                                    })}
                            /></label
                        >
                    </div>
                    <label class="prop-full"
                        >标题<input
                            type="text"
                            value={f.title}
                            on:change={(e) =>
                                updateFrameProps(f.id, {
                                    title: inputValue(e) || f.title,
                                })}
                        /></label
                    >
                    <label class="prop-full"
                        >透明度<input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.05"
                            value={f.opacity ?? 1}
                            on:input={(e) =>
                                updateFrameProps(f.id, {
                                    opacity: inputNumber(e, 1),
                                })}
                        /></label
                    >
                    <div class="edit-grid small-grid">
                        <button
                            on:click={() =>
                                updateFrameProps(f.id, {
                                    flipX: !(f.flipX ?? false),
                                })}>水平翻转</button
                        >
                        <button
                            on:click={() =>
                                updateFrameProps(f.id, {
                                    flipY: !(f.flipY ?? false),
                                })}>垂直翻转</button
                        >
                    </div>
                </div>
            {/each}
        {/if}

        {#if !useExcalidrawBridge && selectedEmbedId && selectedEmbedIds.length <= 1}
            {#each webEmbeds.filter((e) => e.id === selectedEmbedId) as em}
                <div class="floating-edit-panel props-panel embed-props">
                    <div class="edit-title">Embed 属性</div>
                    <div class="prop-grid">
                        <label
                            >X<input
                                type="number"
                                value={Math.round(em.x)}
                                on:change={(e) =>
                                    updateEmbedProps(em.id, {
                                        x: inputNumber(e, 0),
                                    })}
                            /></label
                        >
                        <label
                            >Y<input
                                type="number"
                                value={Math.round(em.y)}
                                on:change={(e) =>
                                    updateEmbedProps(em.id, {
                                        y: inputNumber(e, 0),
                                    })}
                            /></label
                        >
                        <label
                            >W<input
                                type="number"
                                value={Math.round(em.w)}
                                on:change={(e) =>
                                    updateEmbedProps(em.id, {
                                        w: Math.max(220, inputNumber(e, 220)),
                                    })}
                            /></label
                        >
                        <label
                            >H<input
                                type="number"
                                value={Math.round(em.h)}
                                on:change={(e) =>
                                    updateEmbedProps(em.id, {
                                        h: Math.max(140, inputNumber(e, 140)),
                                    })}
                            /></label
                        >
                    </div>
                    <label class="prop-full"
                        >URL<input
                            type="text"
                            value={em.url}
                            on:change={(e) =>
                                updateEmbedProps(em.id, {
                                    url: inputValue(e) || em.url,
                                })}
                        /></label
                    >
                    <label class="prop-full"
                        >透明度<input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.05"
                            value={em.opacity ?? 1}
                            on:input={(e) =>
                                updateEmbedProps(em.id, {
                                    opacity: inputNumber(e, 1),
                                })}
                        /></label
                    >
                    <div class="edit-grid small-grid">
                        <button
                            on:click={() =>
                                updateEmbedProps(em.id, {
                                    flipX: !(em.flipX ?? false),
                                })}>水平翻转</button
                        >
                        <button
                            on:click={() =>
                                updateEmbedProps(em.id, {
                                    flipY: !(em.flipY ?? false),
                                })}>垂直翻转</button
                        >
                    </div>
                </div>
            {/each}
        {/if}

        {#if !useExcalidrawBridge}
            {#each webEmbeds.filter((e) => !e.hidden) as embed (embed.id)}
                <div
                    class="web-embed"
                    class:selected={selectedEmbedIds.includes(embed.id)}
                    class:locked={!!embed.locked}
                    style={`left:${embed.x}px; top:${embed.y}px; width:${embed.w}px; height:${embed.h}px;`}
                    role="button"
                    aria-label="select embed"
                    tabindex="-1"
                    on:pointerdown={(e) =>
                        toggleEmbedSelection(embed.id, e.shiftKey)}
                >
                    <div
                        class="web-embed-head"
                        on:pointerdown={(e) => startDragWebEmbed(embed.id, e)}
                    >
                        <span>🌐 Web</span>
                        <div class="web-embed-actions">
                            <button
                                class="web-embed-mini"
                                on:click={() => toggleEmbedLock(embed.id)}
                                >{embed.locked ? "🔒" : "🔓"}</button
                            ><button
                                class="web-embed-mini"
                                on:click={() =>
                                    updateEmbedProps(embed.id, {
                                        hidden: !embed.hidden,
                                    })}>{embed.hidden ? "🙈" : "👁"}</button
                            ><button
                                class="web-embed-mini"
                                on:click={() => moveWebEmbedLayer(embed.id, -1)}
                                >↓</button
                            ><button
                                class="web-embed-mini"
                                on:click={() => moveWebEmbedLayer(embed.id, 1)}
                                >↑</button
                            ><button
                                class="web-embed-mini"
                                on:click={() => editWebEmbedUrl(embed.id)}
                                >✎</button
                            ><button
                                class="web-embed-close"
                                on:click={() => removeWebEmbed(embed.id)}
                                >✕</button
                            >
                        </div>
                    </div>
                    <iframe
                        src={embed.url}
                        title={embed.url}
                        loading="lazy"
                        referrerpolicy="no-referrer"
                    ></iframe>
                    <div
                        class="web-embed-resize"
                        on:pointerdown={(e) => startResizeWebEmbed(embed.id, e)}
                    ></div>
                </div>
            {/each}
        {/if}

        <div class="slides-panel">
            <div class="slides-title">📋 幻灯片</div>

            <div class="slides-actions">
                <button
                    class="slide-icon"
                    title="上移"
                    on:click={() => moveSlide(-1)}>↑</button
                >
                <button
                    class="slide-icon"
                    title="下移"
                    on:click={() => moveSlide(1)}>↓</button
                >
                <button
                    class="slide-icon"
                    title="复制"
                    on:click={duplicateSlide}>⎘</button
                >
                <button class="slide-icon" title="删除" on:click={deleteSlide}
                    >✕</button
                >
            </div>

            <div class="slides-list">
                {#each slides as thumb, i}
                    <button
                        class="slide-item"
                        class:active={i === activeSlide}
                        class:record-target={i === activeSlide &&
                            (isRecording ||
                                isRecordingStarting ||
                                recordCountdownLeft > 0)}
                        class:dragging={draggingSlideIndex === i}
                        draggable="true"
                        on:dragstart={() => onSlideDragStart(i)}
                        on:dragover|preventDefault
                        on:drop={() => onSlideDrop(i)}
                        on:dragend={() => (draggingSlideIndex = null)}
                        on:click={() => {
                            saveCurrentSlide();
                            loadSlide(i);
                        }}
                    >
                        <span class="slide-no">{i + 1}</span>
                        {#if thumb}
                            <img src={thumb} alt={`slide-${i + 1}`} />
                        {:else}
                            <span class="slide-empty">空</span>
                        {/if}
                    </button>
                    <span class="slide-label" class:active={i === activeSlide}
                        >Slide {i + 1}</span
                    >
                {/each}
            </div>

            <button
                class="slide-add"
                on:click={addSlide}
                on:dragover|preventDefault
                on:drop={() => onSlideDrop(slides.length - 1)}>＋</button
            >
        </div>

        {#if showTeleprompter}
            <div
                bind:this={teleprompterPanelEl}
                class="teleprompter-panel"
                style={`opacity:${teleprompterOpacity / 100}; transform:translate(${teleprompterOffsetX}px, ${teleprompterOffsetY}px);`}
            >
                <div
                    class="teleprompter-controls compact teleprompter-dragbar"
                    on:pointerdown={startDragTeleprompter}
                >
                    <button
                        class="icon-btn"
                        on:click={startTeleprompter}
                        disabled={isTeleprompterRunning}
                        title="播放">▶</button
                    >
                    <button
                        class="icon-btn"
                        on:click={stopTeleprompter}
                        disabled={!isTeleprompterRunning}
                        title="暂停">⏸</button
                    >
                    <button
                        class="icon-btn"
                        on:click={resetTeleprompterPosition}
                        title="重置">↺</button
                    >

                    <div class="mini slider-inline">
                        <span>速度</span>
                        <input
                            type="range"
                            min="10"
                            max="180"
                            step="5"
                            bind:value={teleprompterSpeed}
                        />
                    </div>

                    <div class="mini slider-inline">
                        <span>透明</span>
                        <input
                            type="range"
                            min="20"
                            max="100"
                            step="2"
                            bind:value={teleprompterOpacity}
                        />
                    </div>

                    <div class="mini slider-inline">
                        <span>字号</span>
                        <input
                            type="range"
                            min="14"
                            max="52"
                            step="1"
                            bind:value={teleprompterFontSize}
                        />
                    </div>
                </div>

                <textarea
                    class="teleprompter-editor"
                    bind:this={teleprompterTextEl}
                    bind:value={teleprompterText}
                    style={`font-size:${teleprompterFontSize}px`}
                    placeholder="在此粘贴你的脚本..."
                    on:input={() => {
                        stopTeleprompter();
                        resetTeleprompterPosition();
                    }}
                />

                <div class="teleprompter-note">
                    仅你可见，不会出现在录制内容中。
                </div>
            </div>
        {/if}
    </div>

    {#if exportNotice}
        <div class={`export-notice ${exportNoticeLevel}`}>{exportNotice}</div>
    {/if}

    {#if showShortcutsHelp}
        <div class="shortcut-panel">
            {#if useExcalidrawBridge}
                <div>
                    <strong>白板:</strong> 使用顶部工具栏进行选择/图形/文字/缩放/平移。
                </div>
                <div>
                    <strong>录制:</strong> Space / P 开始或停止录制（可配置倒计时）
                    · K 暂停/继续
                </div>
            {:else}
                <div>
                    <strong>工具:</strong> V 画笔 · E 橡皮 · T 文本 · L 线 · R 矩形
                    · C 圆 · F 框架
                </div>
                <div>
                    <strong>编辑:</strong> Ctrl/Cmd+Z 撤销 · Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y
                    重做 · Ctrl/Cmd+A 全选可见 · Ctrl/Cmd+C/V 复制粘贴 · Ctrl/Cmd+D
                    快速复制
                </div>
                <div>
                    <strong>对象:</strong> 方向键微调（Shift=10px） · [/] 调层级
                    · Delete 删除 · Esc 取消选中
                </div>
                <div>
                    <strong>幻灯片:</strong> Ctrl/Cmd+Shift+D 复制当前页 · Alt+←/→
                    调整当前页顺序
                </div>
                <div>
                    <strong>录制:</strong> Space / P 开始或停止录制（可配置倒计时）
                    · K 暂停/继续
                </div>
            {/if}
        </div>
    {/if}
</div>

{#if showSettings}
    <button
        class="modal-backdrop"
        aria-label="关闭录制设置"
        on:click={() => (showSettings = false)}
    ></button>

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
                <button on:click={applyLightCanvasPreset}>一键白底黑字</button>
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
            <div class="section-title">画布样式</div>
            <label class="slider-row">
                <span>圆角</span>
                <input
                    type="range"
                    min="0"
                    max="64"
                    step="2"
                    bind:value={canvasCornerRadius}
                />
                <span>{canvasCornerRadius}px</span>
            </label>
            <label class="slider-row">
                <span>画布边距</span>
                <input
                    type="range"
                    min="0"
                    max="120"
                    step="2"
                    bind:value={canvasInnerPadding}
                />
                <span>{canvasInnerPadding}px</span>
            </label>
        </section>

        <section>
            <div class="section-title">预览</div>
            <div class="settings-preview-wrap">
                <div
                    class="settings-preview"
                    style={`aspect-ratio:${boardAspectRatio}; border-radius:${canvasCornerRadius}px; padding:${Math.max(2, Math.floor(canvasInnerPadding / 3))}px; background:${backgroundColor};`}
                >
                    <div class="settings-preview-inner"></div>
                    <div class="settings-preview-dot"></div>
                </div>
            </div>
        </section>

        <section>
            <div class="section-title">提词器透明度</div>
            <label class="slider-row">
                <input
                    type="range"
                    min="20"
                    max="100"
                    step="2"
                    bind:value={teleprompterOpacity}
                />
                <span>{teleprompterOpacity}%</span>
            </label>
        </section>

        <section>
            <div class="section-title">导出格式</div>
            <div class="export-format-row">
                <button
                    class:active={exportFormat === "webm"}
                    on:click={() => (exportFormat = "webm")}
                    >WebM（兼容好）</button
                >
                <button
                    class:active={exportFormat === "mp4"}
                    on:click={() => (exportFormat = "mp4")}>MP4（默认）</button
                >
            </div>
            <div class="subnote">
                说明：默认导出 MP4；若浏览器不支持 MP4 录制会自动回退到 WebM。
            </div>
        </section>

        <section>
            <div class="section-title">开始录制倒计时</div>
            <label class="switch-row">
                <input type="checkbox" bind:checked={enableRecordCountdown} />
                <span>启用倒计时</span>
            </label>
            <label class="slider-row">
                <span>秒数</span>
                <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    bind:value={recordCountdownSeconds}
                    disabled={!enableRecordCountdown}
                />
                <span>{recordCountdownSeconds}s</span>
            </label>
        </section>

        <section>
            <div class="section-title">摄像头（录制画中画）</div>
            <label class="switch-row">
                <input type="checkbox" bind:checked={showCameraInRecord} />
                <span>录制时显示摄像头画面</span>
            </label>
            <div class="camera-settings">
                <label class="slider-row">
                    <span>大小</span>
                    <input
                        type="range"
                        min="100"
                        max="320"
                        step="4"
                        bind:value={cameraSize}
                        disabled={!showCameraInRecord}
                    />
                    <span>{cameraSize}px</span>
                </label>
                <label class="slider-row">
                    <span>圆角</span>
                    <input
                        type="range"
                        min="0"
                        max="80"
                        step="2"
                        bind:value={cameraRadius}
                        disabled={!showCameraInRecord}
                    />
                    <span>{cameraRadius}px</span>
                </label>
                <label class="slider-row">
                    <span>边距</span>
                    <input
                        type="range"
                        min="0"
                        max="120"
                        step="2"
                        bind:value={cameraMargin}
                        disabled={!showCameraInRecord}
                    />
                    <span>{cameraMargin}px</span>
                </label>

                <label class="switch-row">
                    <input
                        type="checkbox"
                        bind:checked={cameraMirror}
                        disabled={!showCameraInRecord}
                    />
                    <span>镜像摄像头</span>
                </label>

                <div class="camera-corner-grid">
                    <button
                        class:active={cameraCorner === "tl"}
                        on:click={() => (cameraCorner = "tl")}
                        disabled={!showCameraInRecord}>左上</button
                    >
                    <button
                        class:active={cameraCorner === "tr"}
                        on:click={() => (cameraCorner = "tr")}
                        disabled={!showCameraInRecord}>右上</button
                    >
                    <button
                        class:active={cameraCorner === "bl"}
                        on:click={() => (cameraCorner = "bl")}
                        disabled={!showCameraInRecord}>左下</button
                    >
                    <button
                        class:active={cameraCorner === "br"}
                        on:click={() => (cameraCorner = "br")}
                        disabled={!showCameraInRecord}>右下</button
                    >
                </div>

                <label class="slider-row">
                    <span>X偏移</span>
                    <input
                        type="range"
                        min="-320"
                        max="320"
                        step="2"
                        bind:value={cameraOffsetX}
                        disabled={!showCameraInRecord}
                    />
                    <span>{cameraOffsetX}px</span>
                </label>
                <label class="slider-row">
                    <span>Y偏移</span>
                    <input
                        type="range"
                        min="-320"
                        max="320"
                        step="2"
                        bind:value={cameraOffsetY}
                        disabled={!showCameraInRecord}
                    />
                    <span>{cameraOffsetY}px</span>
                </label>
                <div class="camera-reset-row">
                    <button
                        on:click={() => {
                            cameraOffsetX = 0;
                            cameraOffsetY = 0;
                        }}
                        disabled={!showCameraInRecord}>重置摄像头偏移</button
                    >
                </div>
            </div>
        </section>

        <section>
            <div class="section-title">录制链路预检</div>
            <div class="mic-row">
                <button on:click={runRecordPreflight}>运行预检</button>
                <span class="subnote"
                    >最近预检：{lastPreflightAt
                        ? new Date(lastPreflightAt).toLocaleTimeString()
                        : "未运行"}</span
                >
            </div>
        </section>

        <section>
            <div class="section-title">麦克风</div>
            <label class="switch-row">
                <input type="checkbox" bind:checked={includeMicAudio} />
                <span>录制时包含麦克风声音</span>
            </label>
            <div class="mic-row">
                <select
                    bind:value={selectedMicDeviceId}
                    disabled={!includeMicAudio}
                >
                    {#if micDevices.length === 0}
                        <option value="">未检测到麦克风</option>
                    {/if}
                    {#each micDevices as dev}
                        <option value={dev.deviceId}
                            >{dev.label ||
                                `麦克风 ${dev.deviceId.slice(0, 6)}`}</option
                        >
                    {/each}
                </select>
                <button on:click={() => void refreshMicDevices()}
                    >刷新设备</button
                >
                <button on:click={runMicLevelTest}
                    >{micTestRunning ? "检测中..." : "测试麦克风"}</button
                >
            </div>
            <div class="mic-level-wrap">
                <div class="mic-level-bar">
                    <div
                        class="mic-level-fill"
                        style={`width:${Math.round(micLevel * 100)}%`}
                    ></div>
                </div>
                <span>{Math.round(micLevel * 100)}%</span>
            </div>
        </section>

        <section>
            <div class="section-title">鼠标光标效果</div>
            <label class="switch-row">
                <input type="checkbox" bind:checked={showCursorHighlight} />
                <span>录制时显示光标高亮</span>
            </label>
            <div class="cursor-settings">
                <input
                    type="color"
                    bind:value={cursorHighlightColor}
                    disabled={!showCursorHighlight}
                />
                <label class="slider-row">
                    <input
                        type="range"
                        min="8"
                        max="60"
                        step="2"
                        bind:value={cursorHighlightSize}
                        disabled={!showCursorHighlight}
                    />
                    <span>{cursorHighlightSize}px</span>
                </label>
            </div>
        </section>
    </div>
{/if}

<style>
    .page {
        --text: #111111;
        --subtext: #555555;
        --accent: #111111;
        --button: #f3f3f3;
        --sidebar-bg: #ffffff;

        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: center;
        width: 100%;
        max-width: none;
        margin: 0;
        padding: 12px;
        box-sizing: border-box;
        background: #eceff3;
        color: #111111;
        border-radius: 0;
        min-height: 100vh;
    }

    .toolbar {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        background: #f6f6f6;
        border-radius: 12px;
        padding: 10px;
        border: 1px solid #ebebeb;
    }

    .left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .tool-btn {
        min-width: 36px;
        width: 36px;
        height: 36px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        line-height: 1;
    }

    .bridge-pill {
        display: inline-flex;
        align-items: center;
        height: 32px;
        padding: 0 10px;
        border-radius: 999px;
        background: #eef2ff;
        color: #3730a3;
        border: 1px solid #c7d2fe;
        font-size: 12px;
    }

    .text-size {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
    }

    button {
        border: 1px solid #e5e5e5;
        border-radius: 10px;
        padding: 8px 12px;
        background: #ffffff;
        color: #111111;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    button.active {
        background: #111111;
        color: #ffffff;
        border-color: #111111;
    }

    .board-wrap {
        position: relative;
        width: min(1440px, calc(100vw - 176px));
        height: auto;
        max-height: unset;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(17, 17, 17, 0.14);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
        background: #ffffff;
    }

    .board-wrap.recording-slide-focus {
        border-color: #1f9d58;
        box-shadow:
            0 0 0 2px rgba(31, 157, 88, 0.26),
            0 14px 34px rgba(15, 23, 42, 0.14);
    }

    .board {
        width: 100%;
        height: 100%;
        touch-action: none;
        display: block;
        cursor: crosshair;
        border-radius: inherit;
        background: transparent;
    }

    .excalidraw-host {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        border-radius: inherit;
        overflow: hidden;
        background: #ffffff;
    }

    .excalidraw-host :global(.App-toolbar),
    .excalidraw-host :global(.Stack.App-toolbar) {
        display: flex !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
    }

    .snap-guide-v {
        position: fixed;
        top: 0;
        width: 1px;
        height: 100vh;
        background: rgba(110, 168, 255, 0.85);
        z-index: 7;
        pointer-events: none;
    }

    .snap-guide-h {
        position: fixed;
        left: 0;
        width: 100vw;
        height: 1px;
        background: rgba(110, 168, 255, 0.85);
        z-index: 7;
        pointer-events: none;
    }

    .marquee-box {
        position: fixed;
        border: 1px dashed rgba(110, 168, 255, 0.95);
        background: rgba(110, 168, 255, 0.18);
        z-index: 8;
        pointer-events: none;
    }

    .canvas-text-input {
        position: absolute;
        min-width: 180px;
        min-height: 48px;
        max-width: 60%;
        border: 1px dashed #9ca3af;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
        padding: 8px 10px;
        line-height: 1.35;
        font-weight: 700;
        outline: none;
        z-index: 6;
        resize: both;
    }

    .teleprompter-panel {
        position: fixed;
        top: 64px;
        right: 12px;
        width: min(44%, 520px);
        height: min(56vh, 560px);
        min-width: 320px;
        min-height: 260px;
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 24px);
        overflow: auto;
        resize: both;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 10px;
        backdrop-filter: blur(4px);
        color: #111111;
        z-index: 2;
    }

    .teleprompter-dragbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
        padding: 6px 8px;
        border-radius: 8px;
        background: #f3f4f6;
        cursor: move;
        user-select: none;
    }

    .teleprompter-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
    }
    .teleprompter-controls.compact {
        gap: 6px;
        margin-bottom: 6px;
        align-items: center;
    }

    .icon-btn {
        min-width: 30px;
        height: 30px;
        padding: 0;
        border-radius: 8px;
        background: #ffffff;
        border: 1px solid #d1d5db;
        color: #111111;
        font-size: 14px;
        line-height: 1;
    }

    .teleprompter-controls .mini {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        padding: 0 4px;
        opacity: 0.9;
    }

    .teleprompter-controls .mini input {
        width: 72px;
    }

    .slider-inline span {
        min-width: 28px;
        text-align: right;
    }

    .teleprompter-editor {
        width: 100%;
        min-height: 320px;
        border-radius: 10px;
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111111;
        padding: 10px;
        resize: none;
        line-height: 1.7;
        font-weight: 700;
        box-sizing: border-box;
        outline: none;
    }

    .teleprompter-note {
        margin-top: 8px;
        font-size: 12px;
        opacity: 0.9;
        color: #4b5563;
    }

    .hidden-file-input {
        display: none;
    }

    .more-tools-wrap {
        position: relative;
    }

    .more-tools-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 20;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 8px;
        min-width: 170px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .more-tools-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }

    .laser-settings {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 12px;
    }

    .laser-dot {
        position: absolute;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        opacity: 0.45;
        pointer-events: none;
        z-index: 6;
    }

    .frame-item {
        position: fixed;
        border: 2px dashed rgba(17, 17, 17, 0.45);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.88);
        z-index: 5;
        min-width: 40px;
        min-height: 30px;
    }

    .frame-item.draft {
        pointer-events: none;
        border-color: rgba(17, 17, 17, 0.28);
    }

    .frame-item.selected {
        border-color: #6ea8ff;
        box-shadow: 0 0 0 2px rgba(110, 168, 255, 0.35);
    }

    .frame-item.locked {
        border-style: solid;
        border-color: rgba(255, 200, 100, 0.9);
    }

    .frame-head {
        height: 24px;
        background: rgba(243, 244, 246, 0.96);
        color: #111111;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 0 6px;
        font-size: 11px;
        cursor: move;
    }

    .frame-actions {
        display: flex;
        gap: 3px;
    }

    .frame-head button {
        min-width: 22px;
        height: 20px;
        padding: 0;
        border-radius: 5px;
        background: #ffffff;
        color: #111111;
    }

    .frame-resize {
        position: absolute;
        right: 2px;
        bottom: 2px;
        width: 12px;
        height: 12px;
        border-radius: 3px;
        background: rgba(17, 17, 17, 0.22);
        cursor: nwse-resize;
    }

    .web-embed {
        position: fixed;
        background: #fff;
        border: 1px solid rgba(17, 17, 17, 0.16);
        border-radius: 10px;
        overflow: hidden;
        z-index: 5;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    }

    .web-embed-head {
        height: 30px;
        background: #f2f2f2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px;
        cursor: move;
        font-size: 12px;
        color: #333;
    }

    .web-embed-actions {
        display: flex;
        gap: 4px;
        align-items: center;
    }

    .web-embed-head button.web-embed-mini,
    .web-embed-head button.web-embed-close {
        min-width: 24px;
        height: 22px;
        border-radius: 6px;
        padding: 0;
        background: #fff;
        color: #333;
        border: 1px solid #ddd;
    }

    .web-embed-resize {
        position: absolute;
        right: 2px;
        bottom: 2px;
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background: rgba(17, 17, 17, 0.2);
        cursor: nwse-resize;
    }

    .web-embed.selected {
        box-shadow:
            0 0 0 2px rgba(110, 168, 255, 0.45),
            0 8px 28px rgba(0, 0, 0, 0.2);
    }

    .web-embed.locked {
        outline: 2px solid rgba(255, 200, 100, 0.85);
        outline-offset: 0;
    }

    .web-embed iframe {
        width: 100%;
        height: calc(100% - 30px);
        border: 0;
        background: #fff;
    }

    .status-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
        align-items: center;
        justify-content: center;
        background: var(--button);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        color: var(--subtext);
    }

    .tool-chip {
        min-width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: #fff;
        border: 1px solid #e5e7eb;
        color: #111;
        font-size: 14px;
        line-height: 1;
        padding: 0 4px;
    }

    .shortcut-panel {
        margin-top: 6px;
        background: var(--button);
        border-radius: 10px;
        padding: 10px;
        font-size: 12px;
        color: var(--subtext);
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .export-notice {
        margin-top: 6px;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        text-align: center;
    }

    .export-notice.info {
        background: rgba(90, 180, 120, 0.15);
        color: #2f7a44;
    }

    .export-notice.warn {
        background: rgba(255, 193, 7, 0.15);
        color: #9c6a00;
    }

    .export-notice.error {
        background: rgba(220, 53, 69, 0.15);
        color: #a1122a;
    }

    .hint {
        font-size: 13px;
        opacity: 0.9;
        color: #4b5563;
        text-align: center;
    }

    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(17, 24, 39, 0.18);
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
        border: 1px solid rgba(17, 17, 17, 0.08);
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
        background: #111111;
        color: #fff;
        border-color: #111111;
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

    .settings-preview-wrap {
        display: flex;
        justify-content: center;
        padding: 8px 0 2px;
    }

    .settings-preview {
        position: relative;
        width: min(360px, 100%);
        border: 1px solid rgba(17, 17, 17, 0.16);
        box-sizing: border-box;
    }

    .settings-preview-inner {
        width: 100%;
        height: 100%;
        border-radius: inherit;
        background: rgba(255, 255, 255, 0.85);
    }

    .settings-preview-dot {
        position: absolute;
        right: 14px;
        bottom: 10px;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: rgba(17, 17, 17, 0.2);
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
        top: 14px;
        right: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
        z-index: 10;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(17, 17, 17, 0.12);
        border-radius: 12px;
        padding: 6px 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        user-select: none;
    }

    .fc-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 32px;
        cursor: grab;
        color: #999;
        font-size: 16px;
        letter-spacing: 2px;
        flex-shrink: 0;
        border-radius: 6px;
        transition: background 0.15s;
    }
    .fc-drag-handle:hover {
        background: rgba(17, 17, 17, 0.06);
        color: #555;
    }
    .fc-drag-handle:active {
        cursor: grabbing;
        background: rgba(17, 17, 17, 0.1);
    }

    .slide-title-overlay {
        position: absolute;
        top: 10px;
        left: 14px;
        z-index: 3;
        font-size: 13px;
        font-weight: 500;
        color: rgba(17, 17, 17, 0.5);
        pointer-events: none;
        user-select: none;
        letter-spacing: 0.3px;
    }

    .camera-overlay {
        position: absolute;
        z-index: 9;
        overflow: hidden;
        background: #000;
        border: 2px solid rgba(255, 255, 255, 0.85);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
        cursor: grab;
        user-select: none;
        touch-action: none;
    }

    .camera-overlay.dragging {
        cursor: grabbing;
    }

    .camera-overlay video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
        transform-origin: center;
    }

    .countdown-overlay {
        position: absolute;
        inset: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(17, 24, 39, 0.55);
        backdrop-filter: blur(4px);
        pointer-events: none;
    }

    .countdown-number {
        font-size: 140px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 0 6px 36px rgba(0, 0, 0, 0.35);
        animation: countdown-pulse 0.9s ease-out;
    }

    @keyframes countdown-pulse {
        0% {
            transform: scale(1.6);
            opacity: 0.3;
        }
        50% {
            transform: scale(1);
            opacity: 1;
        }
        100% {
            transform: scale(0.92);
            opacity: 0.85;
        }
    }

    .floating-edit-panel {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 7;
        background: #ffffff;
        border: 1px solid rgba(17, 17, 17, 0.12);
        border-radius: 12px;
        padding: 8px;
        width: 180px;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    }

    .edit-title {
        font-size: 12px;
        color: #555;
        margin-bottom: 6px;
    }

    .edit-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
    }

    .small-grid {
        margin-top: 6px;
    }

    .group-panel {
        top: 12px;
        left: 206px;
        width: 210px;
    }

    .hidden-panel {
        top: 12px;
        left: 428px;
        width: 240px;
    }

    .hidden-list {
        max-height: 160px;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .hidden-item,
    .hidden-unhide-all {
        background: #fff;
        color: #222;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 6px 8px;
        font-size: 12px;
        text-align: left;
    }

    .hidden-unhide-all {
        margin-top: 8px;
        text-align: center;
    }

    .props-panel {
        left: 12px;
        width: 250px;
    }

    .frame-props {
        top: 210px;
    }

    .embed-props {
        top: 330px;
    }

    .prop-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
    }

    .prop-grid label,
    .prop-full {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 11px;
        color: #555;
    }

    .prop-grid input,
    .prop-full input {
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 6px 8px;
        background: #fff;
        font-size: 12px;
        color: #222;
    }

    .prop-full {
        margin-top: 6px;
    }

    .embed-panel {
        top: 122px;
    }

    .edit-grid button {
        background: #fff;
        color: #222;
        border: 1px solid #ddd;
        padding: 6px 4px;
        border-radius: 8px;
        font-size: 12px;
    }

    .slides-panel {
        position: absolute;
        right: 12px;
        top: 74px;
        z-index: 6;
        width: 74px;
        background: #ffffff;
        border: 1px solid rgba(17, 17, 17, 0.12);
        border-radius: 14px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }

    .slides-title {
        font-size: 11px;
        color: #555;
    }

    .slides-actions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        width: 100%;
    }

    .slide-icon {
        height: 26px;
        border-radius: 8px;
        border: 1px solid #d8d8d8;
        background: #fff;
        color: #333;
        padding: 0;
        font-size: 13px;
    }

    .slides-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 230px;
        overflow: auto;
        width: 100%;
        align-items: center;
    }

    .slide-item {
        width: 54px;
        height: 42px;
        border-radius: 10px;
        background: #ececec;
        color: #222;
        border: 1px solid #ddd;
        padding: 0;
        font-weight: 700;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .slide-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .slide-no {
        position: absolute;
        left: 4px;
        top: 3px;
        z-index: 1;
        font-size: 10px;
        background: #ffffff;
        color: #111111;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 1px 4px;
    }

    .slide-empty {
        font-size: 11px;
        color: #666;
    }

    .slide-item.active {
        outline: 2px solid #111111;
        outline-offset: 0;
    }

    .slide-item.record-target {
        outline-color: #1f9d58;
    }

    .slide-item.dragging {
        opacity: 0.45;
    }

    .slide-add {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: #fff;
        color: #222;
        border: 1px dashed #bbb;
        padding: 0;
        font-size: 22px;
        line-height: 1;
    }

    .floating-btn {
        background: #ffffff;
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

    .floating-pause {
        background: #f59e0b;
        color: #fff;
        font-weight: 700;
    }

    .slide-label {
        display: block;
        font-size: 10px;
        color: #888;
        text-align: center;
        margin-top: 2px;
        line-height: 1.2;
        user-select: none;
    }

    .slide-label.active {
        color: #111;
        font-weight: 600;
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

    .camera-settings {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .export-format-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .export-format-row button {
        background: #fff;
        color: #222;
        border: 1px solid #ddd;
    }

    .export-format-row button.active {
        background: #111111;
        color: #fff;
        border-color: #111111;
    }

    .subnote {
        margin-top: 6px;
        font-size: 12px;
        color: #666;
    }

    .mic-row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }

    .mic-row select {
        min-width: 280px;
        max-width: 100%;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 7px 10px;
    }

    .mic-level-wrap {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .mic-level-bar {
        height: 8px;
        width: 180px;
        border-radius: 999px;
        background: #eceff3;
        overflow: hidden;
        border: 1px solid #d7dce3;
    }

    .mic-level-fill {
        height: 100%;
        background: linear-gradient(90deg, #2d9d67, #8bc34a);
        width: 0%;
        transition: width 0.08s linear;
    }

    .camera-corner-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
    }

    .camera-corner-grid button {
        background: #fff;
        color: #222;
        border: 1px solid #ddd;
        padding: 6px 8px;
    }

    .camera-corner-grid button.active {
        background: #111111;
        color: #fff;
        border-color: #111111;
    }

    .camera-reset-row {
        display: flex;
        justify-content: flex-end;
    }

    .camera-reset-row button {
        background: #fff;
        color: #222;
        border: 1px solid #ddd;
    }

    @media (max-width: 900px) {
        .page {
            padding: 8px;
        }

        .board-wrap {
            width: calc(100vw - 16px);
        }

        .floating-controls {
            right: 12px;
            top: 12px;
        }

        .slides-panel {
            right: 12px;
            top: 70px;
            width: 64px;
        }

        .group-panel {
            top: 86px;
            left: 12px;
            width: 180px;
        }

        .hidden-panel {
            top: 86px;
            left: 198px;
            width: 170px;
        }

        .props-panel {
            width: 180px;
        }

        .frame-props {
            top: 196px;
        }

        .embed-props {
            top: 306px;
        }

        .teleprompter-panel {
            width: calc(100% - 24px);
            min-width: 0;
        }

        .ratio-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .bg-grid {
            grid-template-columns: repeat(4, 1fr);
        }
    }
</style>
