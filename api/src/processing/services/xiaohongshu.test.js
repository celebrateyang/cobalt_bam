import assert from "node:assert/strict";
import test from "node:test";

import xiaohongshu, { isUnavailableRedirectUrl } from "./xiaohongshu.js";

test("recognizes Xiaohongshu unavailable redirects", () => {
    assert.equal(
        isUnavailableRedirectUrl("https://www.xiaohongshu.com/404"),
        true,
    );
    assert.equal(
        isUnavailableRedirectUrl(
            "https://www.xiaohongshu.com/explore?target_note_id=note123&undertake_note_error=unavailable",
        ),
        true,
    );
    assert.equal(
        isUnavailableRedirectUrl("https://www.xiaohongshu.com/explore/note123"),
        false,
    );
});

test("fetches discovery item URLs with a mobile identity and preserves the token", async () => {
    const originalFetch = globalThis.fetch;
    const noteId = "67ee794b000000001c02b668";
    const submittedUrl = new URL(
        `https://www.xiaohongshu.com/discovery/item/${noteId}?xsec_token=test-token%3D`,
    );
    const requests = [];
    const initialState = {
        noteData: {
            data: {
                noteData: {
                    video: {
                        media: {
                            stream: {
                                h264: [{
                                    videoBitrate: 1000,
                                    masterUrl: "http://sns-video-hw.xhscdn.com/example.mp4",
                                }],
                            },
                        },
                    },
                },
            },
        },
    };

    globalThis.fetch = async (requestUrl, options) => {
        requests.push({ requestUrl, options });
        return {
            url: requestUrl,
            text: async () => (
                `<script>window.__INITIAL_STATE__=${JSON.stringify(initialState)}</script>`
            ),
        };
    };

    try {
        const result = await xiaohongshu({
            id: noteId,
            token: "test-token=",
            h265: false,
            isAudioOnly: false,
            url: submittedUrl,
        });

        assert.equal(requests.length, 1);
        assert.equal(requests[0].requestUrl, submittedUrl.toString());
        assert.match(requests[0].options.headers["user-agent"], /iPhone/);
        assert.equal(
            result.urls,
            "https://sns-video-hw.xhscdn.com/example.mp4",
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});
