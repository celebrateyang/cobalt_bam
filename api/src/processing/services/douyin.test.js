import assert from "node:assert/strict";
import test from "node:test";
import "dotenv/config";

process.env.IS_UPSTREAM_SERVER = "false";
const { default: douyin } = await import("./douyin.js");
const { env } = await import("../../config.js");
const { verifyStream, getInternalTunnelFromURL, destroyInternalStream } = await import("../../stream/manage.js");

const videoId = "7691887194823744742";
const music = "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7683808276688997158.mp3";
const image = "https://p3.douyinpic.com/tos-cn-i-example/image.jpeg";

const audioStream = async (result) => {
    const params = new URL(result.audio).searchParams;
    const stream = await verifyStream(...["id", "sig", "exp", "sec", "iv"].map((key) => params.get(key)));
    const internal = getInternalTunnelFromURL(stream.urls);
    const resultStream = { ...stream, urls: internal?.url || stream.urls };
    if (internal) destroyInternalStream(stream.urls);
    return resultStream;
};

test("a shared slideshow returns images instead of its MP3 play_addr", async (t) => {
    const requests = [];
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("v.douyin.com")) {
            return new Response(null, { status: 302, headers: {
                location: `https://www.iesdouyin.com/share/slides/${videoId}/?mid=7683808241708698414`,
            } });
        }
        assert.match(url, /api\.amemv\.com/);
        return Response.json({ status_code: 0, aweme_detail: {
            aweme_id: videoId,
            desc: "ceramics",
            images: [{ url_list: [image] }, { url_list: [image.replace("image.jpeg", "second.webp")] }],
            video: { play_addr: { uri: music, url_list: [music] } },
        } });
    });
    const result = await douyin({ shortLink: "nUh1gtRAwtU" });
    assert.equal(result.picker.length, 2);
    assert.ok(result.picker.every((entry) => entry.type === "photo" && new URL(entry.url).pathname === "/tunnel"));
    assert.equal(result.urls, undefined);
    assert.equal(result.audioFilename, "ceramics_audio.mp3");
    const stream = await audioStream(result);
    assert.equal(stream.urls, music);
    assert.equal(stream.filename, "ceramics_audio.mp3");
    assert.equal(stream.type, "proxy");
    assert.equal(requests.length, 2);
});

test("image-only App detail is retained without video.play_addr", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({
        status_code: 0,
        aweme_detail: { image_post_info: { images: [{ display_image: { url_list: [image] } }] } },
    }));
    const result = await douyin({ id: videoId });
    assert.equal(result.picker.length, 1);
    assert.equal(result.picker[0].type, "photo");
    assert.equal(result.audio, undefined);
});

test("App slideshow download_url_list is used even when url_list is empty", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({
        status_code: 0,
        aweme_detail: { images: [{ url_list: [], download_url_list: [image] }] },
    }));
    const result = await douyin({ id: videoId });
    assert.equal(result.picker.length, 1);
    assert.equal(result.picker[0].type, "photo");
});

for (const emptyShell of [false, true]) {
    test(`shared slides SSR extracts images (client-only first page: ${emptyShell})`, async (t) => {
        const slidesUrl = `https://www.iesdouyin.com/share/slides/${videoId}/?from_ssr=1`;
        const requests = [];
        t.mock.method(globalThis, "fetch", async (input) => {
            const url = String(input);
            requests.push(url);
            if (url.includes("v.douyin.com")) return new Response(null, { status: 302, headers: { location: slidesUrl } });
            if (url.includes("api.amemv.com")) return Response.json({ status_code: 0 });
            if (emptyShell && url === slidesUrl) return new Response("<html><div id=root></div></html>");
            return new Response(`<script>window._ROUTER_DATA=${JSON.stringify({
                loaderData: { "slides_(id)/page": { slidesInfoRes: { status_code: 0, aweme_details: [{
                    images: [{ download_url_list: [image] }, { download_url_list: [image.replace("image.jpeg", "second.jpeg")] }],
                    video: { play_addr: { uri: music } },
                }] } } },
            })}</script>`);
        });
        const result = await douyin({ shortLink: "nUh1gtRAwtU" });
        assert.equal(result.picker.length, 2);
        assert.ok(result.audio);
        assert.equal(requests[2], slidesUrl);
        assert.equal(requests.length, emptyShell ? 4 : 3);
    });
}

test("ordinary App videos still use the direct video flow", async (t) => {
    const media = "https://v26.douyinvod.com/example.mp4";
    t.mock.method(globalThis, "fetch", async (input) => {
        if (String(input).includes("api.amemv.com")) return Response.json({
            status_code: 0,
            aweme_detail: { desc: "video", video: { play_addr: { url_list: [media] } } },
        });
        assert.equal(String(input), media);
        return new Response("v", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-0/1000000" } });
    });
    const result = await douyin({ id: videoId });
    assert.equal(result.urls, media);
    assert.equal(result.directClientDownload, true);
    assert.equal(result.picker, undefined);
});

test("share-page images take precedence over a background music video URI", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        if (String(input).includes("api.amemv.com")) return Response.json({ status_code: 0 });
        return new Response(`<script>window._ROUTER_DATA=${JSON.stringify({
            loaderData: { "video_(id)/page": { videoInfoRes: { item_list: [{
                images: [{ url_list: [image] }],
                video: { play_addr: { uri: music, url_list: [music] } },
            }] } } },
        })}</script>`);
    });
    const result = await douyin({ id: videoId });
    assert.equal(result.picker.length, 1);
    assert.ok(result.audio);
    assert.equal(result.urls, undefined);
});

for (const mode of ["picker", "music"]) {
    test(`upstream ${mode} response cannot become a false MP4 success`, async (t) => {
        const saved = [env.upstreamURLs, env.upstreamCnURLs, env.upstreamGlobalURLs, env.apiURL];
        env.apiURL = "http://localhost:9000";
        env.upstreamURLs = ["https://api2.freesavevideo.online"];
        env.upstreamCnURLs = env.upstreamURLs;
        env.upstreamGlobalURLs = [];
        t.after(() => {
            [env.upstreamURLs, env.upstreamCnURLs, env.upstreamGlobalURLs, env.apiURL] = saved;
        });
        const picker = [{ type: "photo", url: image }];
        const audio = "https://api2.freesavevideo.online/tunnel?id=audio";
        t.mock.method(globalThis, "fetch", async (input) => {
            const url = String(input);
            if (url.includes("api.amemv.com")) return Response.json({ status_code: 0 });
            if (url.includes("api2.freesavevideo.online")) return Response.json(mode === "picker"
                ? { status: "picker", picker, audio, audioFilename: "ceramics_audio.mp3" }
                : { status: "redirect", url: music, directUrl: music, filename: "ceramics.mp4" });
            assert.match(url, /iesdouyin\.com\/share\/video/);
            return new Response(`<script>window._ROUTER_DATA=${JSON.stringify({
                loaderData: { "video_(id)/page": {} },
            })}</script>`);
        });
        const result = await douyin({ id: videoId });
        if (mode === "picker") assert.deepEqual(result, { picker, audio, audioFilename: "ceramics_audio.mp3" });
        else {
            assert.deepEqual(result.picker, []);
            assert.equal(result.audioFilename, "ceramics_audio.mp3");
            const stream = await audioStream(result);
            assert.equal(stream.urls, music);
            assert.equal(stream.filename, "ceramics_audio.mp3");
        }
        assert.equal(result.urls, undefined);
    });
}
