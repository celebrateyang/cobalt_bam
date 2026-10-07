declare module 'mux.js' {
    type Segment = { initSegment: Uint8Array; data: Uint8Array };
    class Transmuxer {
        constructor(options?: { remux?: boolean });
        on(type: 'data', callback: (segment: Segment) => void): void;
        push(data: Uint8Array): void;
        flush(): void;
    }
    const muxjs: { mp4: { Transmuxer: typeof Transmuxer } };
    export default muxjs;
}
