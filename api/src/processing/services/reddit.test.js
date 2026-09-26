import assert from "node:assert/strict";
import test from "node:test";

import {
    extractRedditVideoUrlFromRss,
    fetchRedditVideoFromRss,
    parseRedditDashManifest,
} from "./reddit.js";

test("extracts the v.redd.it URL from the requested RSS post entry", () => {
    const rss = `
        <feed>
            <entry><content>https://v.redd.it/commentvideo</content><id>t1_comment</id></entry>
            <entry>
                <content>&lt;a href=&quot;https://v.redd.it/ut1vpsx7yw2e1&quot;&gt;[link]&lt;/a&gt;</content>
                <id>t3_1gz1f3u</id>
            </entry>
        </feed>
    `;

    assert.equal(
        extractRedditVideoUrlFromRss(rss, "1gz1f3u"),
        "https://v.redd.it/ut1vpsx7yw2e1",
    );
});

test("selects the highest-quality DASH video and audio representations", () => {
    const manifest = `
        <MPD mediaPresentationDuration="PT1M19.266670227S">
            <Period>
                <AdaptationSet contentType="video">
                    <Representation bandwidth="400000" height="360"><BaseURL>DASH_360.mp4</BaseURL></Representation>
                    <Representation bandwidth="1900000" height="720"><BaseURL>DASH_720.mp4</BaseURL></Representation>
                </AdaptationSet>
                <AdaptationSet contentType="audio">
                    <Representation bandwidth="64000"><BaseURL>DASH_AUDIO_64.mp4</BaseURL></Representation>
                    <Representation bandwidth="128000"><BaseURL>DASH_AUDIO_128.mp4</BaseURL></Representation>
                </AdaptationSet>
            </Period>
        </MPD>
    `;

    assert.deepEqual(
        parseRedditDashManifest(
            manifest,
            "https://v.redd.it/ut1vpsx7yw2e1/DASHPlaylist.mpd",
        ),
        {
            fallback_url: "https://v.redd.it/ut1vpsx7yw2e1/DASH_720.mp4",
            audio_url: "https://v.redd.it/ut1vpsx7yw2e1/DASH_AUDIO_128.mp4",
            duration: 79,
        },
    );
});

test("falls back from a Reddit post RSS feed to its DASH manifest", async (t) => {
    const requestedUrls = [];
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.endsWith("/.rss")) {
            return new Response(`
                <feed><entry>
                    <content>&lt;a href=&quot;https://v.redd.it/ut1vpsx7yw2e1&quot;&gt;[link]&lt;/a&gt;</content>
                    <id>t3_1gz1f3u</id>
                </entry></feed>
            `);
        }

        return new Response(`
            <MPD mediaPresentationDuration="PT1M19.266670227S">
                <AdaptationSet contentType="video">
                    <Representation bandwidth="1900000" height="720"><BaseURL>DASH_720.mp4</BaseURL></Representation>
                </AdaptationSet>
            </MPD>
        `);
    });

    assert.deepEqual(
        await fetchRedditVideoFromRss({
            postId: "1gz1f3u",
            headers: { "user-agent": "test" },
        }),
        {
            fallback_url: "https://v.redd.it/ut1vpsx7yw2e1/DASH_720.mp4",
            audio_url: undefined,
            duration: 79,
        },
    );
    assert.deepEqual(requestedUrls, [
        "https://www.reddit.com/comments/1gz1f3u/.rss",
        "https://v.redd.it/ut1vpsx7yw2e1/DASHPlaylist.mpd",
    ]);
});
