import assert from "node:assert/strict";
import test from "node:test";

import matchAction from "./match-action.js";

const baseArgs = {
    host: "youtube",
    isBatchRequest: false,
    audioFormat: "best",
    isAudioOnly: false,
    isAudioMuted: false,
    disableMetadata: false,
    filenameStyle: "basic",
    convertGif: false,
    requestIP: "127.0.0.1",
    audioBitrate: "128",
    alwaysProxy: false,
    localProcessing: "disabled",
};

const youtubeResult = {
    type: "proxy",
    forceRedirect: true,
    urls: "https://video.example/media.mp4",
    filename: "video.mp4",
    duration: 60,
};

test("Douyin picker exposes original MP3 audio with its unchanged filename", () => {
    const picker = [{ type: "photo", url: "https://example.com/photo.jpg" }];
    const audio = "https://example.com/tunnel?id=audio";
    for (const audioFormat of ["best", "mp3", "ogg"]) {
        const response = matchAction({
            ...baseArgs,
            host: "douyin",
            audioFormat,
            r: { picker, audio, audioFilename: "ceramics_audio.mp3" },
        });
        assert.equal(response.body.status, "picker");
        assert.deepEqual(response.body.picker, picker);
        assert.equal(response.body.audio, audio);
        assert.equal(response.body.audioFilename, "ceramics_audio.mp3");
    }
});

test("returns Amazon HLS through Direct Bridge even with forced local processing", () => {
    const url = "https://m.media-amazon.com/replay/720.m3u8";
    for (const localProcessing of ["disabled", "preferred", "forced"]) {
        const response = matchAction({ ...baseArgs, host: "amazon", localProcessing,
            alwaysProxy: true, r: { service: "amazon", urls: url, isHLS: true, filename: "replay.mp4" } });
        assert.equal(response.body.status, "redirect");
        assert.equal(response.body.service, "amazon");
        assert.equal(response.body.url, url);
        assert.equal(response.body.directUrl, url);
        assert.deepEqual(response.body.directUrlCandidates, [url]);
        assert.equal(response.body.tunnelUrl, undefined);
    }
});

test('returns Xinpianchang progressive media through a server tunnel', () => {
    const response = matchAction({
        ...baseArgs, host: 'xinpianchang',
        r: { urls: 'https://us-xpc5-l2.xpccdn.com/work.mp4', filename: 'work.mp4',
            headers: { Referer: 'https://www.xinpianchang.com/a13690233', Range: 'bytes=0-' } },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'tunnel');
    assert.equal(new URL(response.body.url).pathname, '/tunnel');
});

test("returns Magnific public media through Direct Bridge", () => {
    const mediaUrl = "https://img.magnific.com/free-photo/example.jpg?w=1600";
    const response = matchAction({
        ...baseArgs,
        host: "magnific",
        r: {
            service: "magnific",
            urls: mediaUrl,
            directClientDownload: true,
            isPhoto: true,
            filename: "example.jpg",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.service, "magnific");
    assert.equal(response.body.directUrl, mediaUrl);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps ordinary YouTube direct downloads on the redirect path", () => {
    const response = matchAction({
        ...baseArgs,
        r: youtubeResult,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, youtubeResult.urls);
});

test("keeps forced YouTube batch downloads in the processing queue", () => {
    const response = matchAction({
        ...baseArgs,
        r: youtubeResult,
        isBatchRequest: true,
        alwaysProxy: true,
        localProcessing: "forced",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "local-processing");
    assert.equal(response.body.type, "proxy");
    assert.equal(response.body.output.filename, youtubeResult.filename);
    assert.equal(Array.isArray(response.body.tunnel), true);
    assert.equal(response.body.tunnel.length, 1);
});

test("YouTube original audio bypasses the encoder while keeping browser points deferred", () => {
    const response = matchAction({
        ...baseArgs,
        isAudioOnly: true,
        audioFormat: "best",
        disableMetadata: true,
        alwaysProxy: true,
        localProcessing: "forced",
        r: {
            urls: ["https://video.example/video", "https://video.example/audio"],
            bestAudio: "opus",
            filenameAttributes: { service: "youtube", id: "abc", title: "audio", extension: "mp4" },
            fileMetadata: { title: "audio" },
            cover: "https://video.example/cover.jpg",
        },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "local-processing");
    assert.equal(response.body.type, "proxy");
    assert.equal(response.body.tunnel.length, 1);
    assert.equal(response.body.output.type.startsWith("audio/"), true);
    assert.equal(response.body.output.filename.endsWith(".opus"), true);
    assert.equal(response.body.output.metadata, undefined);
    assert.equal(response.body.audio.cover, undefined);
});

test("keeps IP-bound TikTok yt-dlp media on the server tunnel", () => {
    const mediaUrl = "https://v16-webapp-prime.tiktok.com/video/example";
    const response = matchAction({
        ...baseArgs,
        host: "tiktok",
        localProcessing: "forced",
        r: {
            urls: mediaUrl,
            headers: {
                referer: "https://www.tiktok.com/@creator/video/123",
                "user-agent": "test-agent",
            },
            filename: "tiktok_creator_123.mp4",
            tiktokVideoSourceKind: "yt-dlp",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "tunnel");
    assert.equal(response.body.type, "proxy");
    assert.equal(response.body.directUrl, undefined);
    assert.match(response.body.url, /\/tunnel\?/);
});

test("keeps portable TikTok media on Direct Bridge", () => {
    const mediaUrl = "https://v16.tokcdn.com/example/video.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "tiktok",
        r: {
            urls: mediaUrl,
            filename: "tiktok_creator_123.mp4",
            tiktokVideoSourceKind: "direct-provider",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.directUrl, mediaUrl);
});

test("returns Xiaohongshu video through Direct Bridge", () => {
    const mediaUrl = "https://sns-video-hw.xhscdn.com/stream/example.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "xiaohongshu",
        r: {
            urls: mediaUrl,
            urlCandidates: [mediaUrl],
            filename: "xiaohongshu_note.mp4",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, mediaUrl);
    assert.equal(response.body.directUrl, mediaUrl);
    assert.deepEqual(response.body.directUrlCandidates, [mediaUrl]);
});

test("returns a generic progressive MP4 as a direct redirect", () => {
    const mediaUrl = "https://m.wsj.net/video/example/video.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "generic",
        r: {
            service: "www.wsj.com",
            urls: mediaUrl,
            isHLS: false,
            filenameAttributes: {
                service: "www.wsj.com",
                id: "generic",
                title: "WSJ video",
                extension: "mp4",
            },
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, mediaUrl);
    assert.equal(response.body.directUrl, mediaUrl);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps generic progressive media requiring CDN headers on a server tunnel", () => {
    const response = matchAction({
        host: 'generic', audioFormat: 'mp3', localProcessing: 'never',
        r: {
            urls: 'https://cdn.example.com/video.mp4', service: 'example.com',
            headers: { Cookie: 'token=test', Referer: 'https://example.com/' },
            filename: 'video.mp4',
        },
    });
    assert.equal(response.body.status, 'tunnel');
});

test("keeps generic HLS media on the processing tunnel", () => {
    const response = matchAction({
        ...baseArgs,
        host: "generic",
        r: {
            service: "example.com",
            urls: "https://cdn.example.com/video.m3u8",
            isHLS: true,
            filenameAttributes: {
                service: "example.com",
                id: "generic",
                title: "HLS video",
                extension: "mp4",
            },
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "tunnel");
    assert.equal(response.body.type, "remux");
});

test("returns portable Douyin media through Direct Bridge", () => {
    const mediaUrl = "https://v26.douyinvod.com/video/example.mp4";
    const backupUrl = "https://v3.bytevod.com/video/example.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "douyin",
        r: {
            urls: mediaUrl,
            urlCandidates: [mediaUrl, backupUrl],
            directClientDownload: true,
            filename: "douyin_video.mp4",
            duration: 80,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, mediaUrl);
    assert.equal(response.body.directUrl, mediaUrl);
    assert.equal(response.body.service, "douyin");
    assert.deepEqual(response.body.directUrlCandidates, [mediaUrl, backupUrl]);
});

test("returns a Bilibili progressive MP4 as a Direct Bridge redirect", () => {
    const directUrl = "https://cdn.example/bilibili-progressive.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "bilibili",
        r: {
            urls: directUrl,
            urlCandidates: [directUrl, "https://backup.example/video.mp4"],
            directClientDownload: true,
            filename: "video.mp4",
            duration: 120,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, directUrl);
    assert.equal(response.body.directUrl, directUrl);
    assert.deepEqual(response.body.directUrlCandidates, [
        directUrl,
        "https://backup.example/video.mp4",
    ]);
});

test("returns a submitted Bilibili CDN resource through Direct Bridge", () => {
    const directUrl = "https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/example.m4s?deadline=1999999999";
    const response = matchAction({
        ...baseArgs,
        host: "bilibili_cdn",
        r: {
            service: "bilibili_cdn",
            urls: directUrl,
            directClientDownload: true,
            filename: "bilibili-cdn.mp4",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, directUrl);
    assert.equal(response.body.directUrl, directUrl);
    assert.equal(response.body.service, "bilibili_cdn");
    assert.deepEqual(response.body.directUrlCandidates, [directUrl]);
});

test("returns WeChat Channels MP4 candidates through Direct Bridge", () => {
    const h264 = "https://finder.video.qq.com/251/h264.mp4";
    const h265 = "https://finder.video.qq.com/251/h265.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "wechat_channels",
        r: {
            service: "wechat_channels",
            urls: h264,
            urlCandidates: [h265],
            filename: "wechat_channels_video.mp4",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.directUrl, h264);
    assert.deepEqual(response.body.directUrlCandidates, [h264, h265]);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("returns Tencent Video MP4 candidates through Direct Bridge", () => {
    const primary = "https://ugcws.video.gtimg.com/video.mp4?vkey=key";
    const backup = "https://apd-vlive.apdcdn.tc.qq.com/video.mp4?vkey=key";
    const response = matchAction({
        ...baseArgs,
        host: "tencent_video",
        r: {
            service: "tencent_video",
            urls: primary,
            urlCandidates: [backup],
            directClientDownload: true,
            filename: "tencent_video.mp4",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.service, "tencent_video");
    assert.equal(response.body.directUrl, primary);
    assert.deepEqual(response.body.directUrlCandidates, [primary, backup]);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps iQIYI TS input on the server remux tunnel", () => {
    const sourceUrl = "https://pcw-data.video.iqiyi.com/videos/v1ts/video.ts?qd_sc=signed";
    const response = matchAction({
        ...baseArgs,
        host: "iqiyi",
        localProcessing: "forced",
        alwaysProxy: true,
        r: {
            service: "iqiyi",
            urls: sourceUrl,
            filename: "iqiyi_video.mp4",
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "tunnel");
    assert.equal(response.body.service, "iqiyi");
    assert.equal(response.body.type, "remux");
    assert.match(response.body.url, /\/tunnel\?/);
    assert.equal(response.body.directUrl, undefined);
});

test("keeps forced Tencent Video downloads on Direct Bridge", () => {
    const directUrl = "https://ugcws.video.gtimg.com/video.mp4?vkey=key";
    const response = matchAction({
        ...baseArgs,
        host: "tencent_video",
        localProcessing: "forced",
        alwaysProxy: true,
        isBatchRequest: true,
        r: {
            service: "tencent_video",
            urls: directUrl,
            directClientDownload: true,
            filename: "tencent_video.mp4",
        },
    });

    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.directUrl, directUrl);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps forced WeChat article batch items on Direct Bridge", () => {
    const directUrl = "https://mpvideo.qpic.cn/article-video.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "wechat_channels",
        localProcessing: "forced",
        alwaysProxy: true,
        isBatchRequest: true,
        r: {
            service: "wechat_channels",
            urls: directUrl,
            urlCandidates: ["https://mpvideo.qpic.cn/article-video-backup.mp4"],
            filename: "wechat_article_02.mp4",
            directClientDownload: true,
        },
    });

    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, directUrl);
    assert.equal(response.body.tunnel, undefined);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps a forced Bilibili batch progressive MP4 off the server tunnel", () => {
    const directUrl = "https://upos-sz-mirrorcos.bilivideo.com/video.mp4";
    const response = matchAction({
        ...baseArgs,
        host: "bilibili",
        isBatchRequest: true,
        alwaysProxy: true,
        localProcessing: "forced",
        r: {
            urls: directUrl,
            urlCandidates: [directUrl, "https://upos-sz-mirrorali.bilivideo.com/video.mp4"],
            directClientDownload: true,
            filename: "video.mp4",
            duration: 120,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.directUrl, directUrl);
    assert.equal(response.body.tunnelUrl, undefined);
});

const soundcloudResult = {
    urls: "https://cf-media.sndcdn.com/track.128.mp3?Policy=signed",
    bestAudio: "mp3",
    isHLS: false,
    directClientDownload: true,
    filenameAttributes: {
        service: "soundcloud",
        id: 123,
        title: "Track",
        artist: "Artist",
    },
    duration: 240,
};

test("returns a SoundCloud progressive MP3 as a Direct Bridge redirect", () => {
    const response = matchAction({
        ...baseArgs,
        host: "soundcloud",
        isAudioOnly: true,
        localProcessing: "preferred",
        r: soundcloudResult,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.url, soundcloudResult.urls);
    assert.equal(response.body.directUrl, soundcloudResult.urls);
    assert.deepEqual(response.body.directUrlCandidates, [soundcloudResult.urls]);
    assert.match(response.body.filename, /\.mp3$/);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps a forced SoundCloud progressive MP3 off the server tunnel", () => {
    const response = matchAction({
        ...baseArgs,
        host: "soundcloud",
        isAudioOnly: true,
        alwaysProxy: true,
        localProcessing: "forced",
        r: soundcloudResult,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "redirect");
    assert.equal(response.body.directUrl, soundcloudResult.urls);
    assert.equal(response.body.tunnelUrl, undefined);
});

test("keeps SoundCloud MP3 conversion on the processing path when source is HLS", () => {
    const response = matchAction({
        ...baseArgs,
        host: "soundcloud",
        isAudioOnly: true,
        audioFormat: "mp3",
        localProcessing: "preferred",
        r: {
            ...soundcloudResult,
            urls: "https://cf-hls-media.sndcdn.com/playlist.m3u8",
            bestAudio: "opus",
            isHLS: true,
            directClientDownload: false,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "tunnel");
    assert.equal(response.body.directUrl, undefined);
});

test("creates a named MP3 tunnel for Kuaishou audio-only downloads", () => {
    const response = matchAction({
        ...baseArgs,
        host: "kuaishou",
        isAudioOnly: true,
        audioFormat: "mp3",
        r: {
            type: "video",
            urls: "https://cdn.example/kuaishou-video.mp4",
            filename: "kuaishou_123.mp4",
            audioFilename: "kuaishou_123_audio",
            duration: 240,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "tunnel");
    assert.equal(response.body.type, "audio");
    assert.equal(response.body.filename, "kuaishou_123_audio.mp3");
    assert.equal(response.body.duration, 240);
});
