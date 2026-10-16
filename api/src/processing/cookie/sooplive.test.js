import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("loads SOOP sessions only upstream and keeps credentials out of media headers", async () => {
    const root = join(homedir(), ".codex", "task-artifacts", "cobalt-soop-tests");
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, "cookie-"));
    const path = join(directory, "cookies.json");
    await writeFile(path, JSON.stringify({ sooplive: ["session=test-only"] }), "utf8");
    try {
        for (const upstream of ["false", "true"]) {
            const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
                import assert from 'node:assert/strict';
                const { loadFromFile, getCookie } = await import(${JSON.stringify(new URL("./manager.js", import.meta.url).href)});
                await loadFromFile(process.argv[1]);
                const expected = process.env.IS_UPSTREAM_SERVER === 'true' ? 'session=test-only' : undefined;
                assert.equal(getCookie('sooplive')?.toString(), expected);
                globalThis.fetch = async (_url, options) => {
                    assert.equal(options.headers.cookie, expected);
                    return Response.json({ data: { grade: 19, files: [{
                        file: 'https://vod-normal-global-cdn-z02.sooplive.com/video.m3u8'
                    }] } });
                };
                const { default: sooplive } = await import(${JSON.stringify(new URL("../services/sooplive.js", import.meta.url).href)});
                const media = await sooplive({ id: '123', quality: 'max' });
                assert.equal(media.error, undefined);
                assert.equal(media.headers.cookie, undefined);
                assert.ok(!JSON.stringify(media).includes('test-only'));
                process.exit(0);
            `, path], {
                env: { ...process.env, IS_UPSTREAM_SERVER: upstream, API_URL: "http://localhost:9000/" },
                encoding: "utf8",
                timeout: 30000,
            });
            assert.equal(result.status, 0, `upstream=${upstream}: ${result.stderr}`);
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
