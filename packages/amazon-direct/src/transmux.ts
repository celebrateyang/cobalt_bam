/// <reference path="./mux.d.ts" />
import muxjs from 'mux.js';
import { normalizeMp4Durations } from './mp4';

// Flush one HLS TS segment at a time. Callers can persist each MP4 fragment
// immediately instead of retaining an entire long video in JavaScript memory.
export const createTsTransmuxer = () => {
    const transmuxer = new muxjs.mp4.Transmuxer({ remux: true });
    let initialized = false;
    let output: Uint8Array[] = [];
    transmuxer.on('data', segment => {
        if (!initialized) {
            output.push(normalizeMp4Durations(segment.initSegment));
            initialized = true;
        }
        output.push(segment.data);
    });
    return {
        push(data: Uint8Array) {
            if (!data.length || data.length % 188 || data[0] !== 0x47) {
                throw new Error('Invalid MPEG-TS segment.');
            }
            output = [];
            transmuxer.push(data);
            transmuxer.flush();
            if (!output.length) throw new Error('MPEG-TS segment produced no MP4 data.');
            const fragments = output;
            output = [];
            return fragments;
        },
    };
};
