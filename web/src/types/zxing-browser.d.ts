declare module '@zxing/browser' {
    export interface Result {
        getText(): string;
    }

    export interface IScannerControls {
        stop(): void;
    }

    export class BrowserQRCodeReader {
        constructor(options?: unknown);
        decodeFromVideoDevice(
            deviceId: string | undefined,
            videoElement: HTMLVideoElement,
            callback: (result: Result | undefined, error: unknown) => void
        ): Promise<IScannerControls>;
    }
}
