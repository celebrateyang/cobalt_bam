import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import ffprobe from 'ffprobe-static';
import { selectFfmpegExecutable, selectMp4MovFlags } from './ffmpeg.js';

const run = (executable, args, input) => new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', code => code === 0
        ? resolve({ stdout: Buffer.concat(chunks), stderr })
        : reject(new Error(`FFmpeg probe failed (${code}): ${stderr}`)));
    child.stdin.end(input);
});

test('iQIYI streaming MP4 writes AAC decoder configuration and audible audio', { timeout: 30000 }, async () => {
    const info = { service: 'iqiyi', type: 'remux' };
    const executable = selectFfmpegExecutable(info);
    const source = await run(executable, [
        '-v', 'error', '-f', 'lavfi', '-i', 'color=size=64x64:rate=25',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
        '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
        '-f', 'mpegts', 'pipe:1',
    ]);
    const output = await run(executable, [
        '-v', 'error', '-f', 'mpegts', '-i', 'pipe:0',
        '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'copy',
        '-movflags', selectMp4MovFlags(info), '-bsf:a', 'aac_adtstoasc',
        '-f', 'mp4', 'pipe:1',
    ], source.stdout);
    const probe = await run(process.platform === 'win32' ? ffprobe.path : '/usr/bin/ffprobe', [
        '-v', 'error', '-select_streams', 'a', '-show_entries',
        'stream=codec_name,profile,extradata_size,extradata,sample_rate', '-show_data', '-of', 'json', 'pipe:0',
    ], output.stdout);
    const [audio] = JSON.parse(probe.stdout.toString()).streams;
    assert.equal(audio?.codec_name, 'aac');
    assert.equal(audio.profile, 'LC');
    assert.equal(audio.sample_rate, '44100');
    assert.ok(audio.extradata_size > 0 || /00000000: [0-9a-f]/i.test(audio.extradata || ''),
        `MP4 must carry AAC AudioSpecificConfig: ${JSON.stringify(audio)}`);
    const decoded = await run(executable, [
        '-hide_banner', '-i', 'pipe:0', '-vn', '-af', 'volumedetect', '-f', 'null', '-',
    ], output.stdout);
    const volume = /mean_volume: (-?[0-9.]+) dB/.exec(decoded.stderr);
    assert.ok(volume && Number(volume[1]) > -50, 'output audio must not be silent');
});
