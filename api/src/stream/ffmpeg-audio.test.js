import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import render from "./ffmpeg.js";
import { setupTunnelHandler } from "../core/itunnel.js";
import { createInternalStream } from "./manage.js";

test("M4A audio conversion writes a decodable file through an HTTP response", { timeout: 30000 }, async (t) => {
    const artifactRoot = join(homedir(), ".codex", "task-artifacts", "cobalt-soundcloud-tests");
    mkdirSync(artifactRoot, { recursive: true });
    const temp = mkdtempSync(join(artifactRoot, "audio-"));
    t.after(() => rmSync(temp, { recursive: true, force: true }));
    const source = execFileSync(ffmpeg, [
        "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
        "-t", "100", "-c:a", "aac", "-f", "adts", "pipe:1",
    ], { windowsHide: true });
    const tunnel = setupTunnelHandler();
    await once(tunnel, "listening");
    const server = createServer((req, res) => {
        if (req.url === "/source") {
            res.setHeader("Content-Length", source.length);
            if (req.method === "HEAD") {
                setTimeout(() => res.end(), 1000);
                return;
            }
            res.end(source);
            return;
        }
        render.convertAudio({
            urls: createInternalStream(`http://127.0.0.2:${server.address().port}/source`, {
                service: "soundcloud",
            }),
            service: "soundcloud", type: "audio", filename: "track.m4a",
            audioFormat: "m4a", audioBitrate: "128", duration: 100,
        }, res);
    });
    t.after(() => {
        for (const listener of [server, tunnel]) {
            listener.closeAllConnections();
            listener.close();
        }
    });
    server.listen(0, "0.0.0.0");
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/download`, {
        signal: AbortSignal.timeout(20000),
    });
    const output = Buffer.from(await response.arrayBuffer());
    assert.ok(output.length > 1000, "conversion must produce audio bytes");
    assert.equal(output.subarray(4, 8).toString(), "ftyp");
    const fragment = output.indexOf(Buffer.from("moof"));
    assert.ok(fragment > 4);
    assert.ok(output.readUInt32BE(fragment - 4) > 0, "long audio must have valid fragment sizes");
    const outputPath = join(temp, "track.m4a");
    writeFileSync(outputPath, output);
    const probe = JSON.parse(execFileSync(
        process.platform === "win32" ? ffprobe.path : "/usr/bin/ffprobe", [
            "-v", "error", "-show_entries", "stream=codec_name,extradata_size,extradata",
            "-show_data", "-of", "json", outputPath,
        ], { encoding: "utf8", windowsHide: true },
    ));
    assert.equal(probe.streams[0].codec_name, "aac");
    assert.ok(probe.streams[0].extradata_size > 0 || /00000000: [0-9a-f]/i.test(probe.streams[0].extradata || ""),
        "M4A must carry AAC decoder configuration");
    execFileSync(ffmpeg, ["-v", "error", "-i", outputPath, "-f", "null", "-"], {
        windowsHide: true,
    });
});
