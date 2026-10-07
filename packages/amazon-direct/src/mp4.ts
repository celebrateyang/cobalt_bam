// mux.js writes 0xffffffff (live/unknown) durations. A downloadable fragmented
// MP4 needs zero here so players determine duration from its finite samples.
export const normalizeMp4Durations = (initSegment: Uint8Array) => {
    const output = new Uint8Array(initSegment);
    const view = new DataView(output.buffer);
    const visit = (start: number, end: number) => {
        for (let offset = start; offset + 8 <= end;) {
            const size = view.getUint32(offset);
            if (size < 8 || offset + size > end) throw new Error('Invalid MP4 header.');
            const type = String.fromCharCode(...output.subarray(offset + 4, offset + 8));
            if (['moov', 'trak', 'mdia'].includes(type)) visit(offset + 8, offset + size);
            if (['mvhd', 'mdhd', 'tkhd'].includes(type)) {
                const durationOffset = offset + (type === 'tkhd' ? 28 : 24);
                if (output[offset + 8] !== 0 || durationOffset + 4 > offset + size) throw new Error('Unsupported MP4 header.');
                if (view.getUint32(durationOffset) === 0xffffffff) view.setUint32(durationOffset, 0);
            }
            offset += size;
        }
    };
    visit(0, output.length);
    return output;
};
