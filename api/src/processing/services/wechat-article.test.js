import assert from "node:assert/strict";
import test from "node:test";

import {
    buildWechatArticleResult,
    decodeWechatValue,
    parseWechatArticle,
    resolveTencentVideo,
} from "./wechat-article.js";

const fixture = `
<meta property="og:title" content="Safety videos">
<iframe class="video_iframe" data-mpvid="wxv_1234567890123456789"></iframe>
<mp-common-videosnap data-type="video" data-id="export/example"
 data-desc="Finder item" data-nickname="Creator"
 data-url="https://findermp.video.qq.com/cover?wxampicformat=503"></mp-common-videosnap>
<iframe class="wx_video_iframe"
 data-src="https://v.qq.com/txp/iframe/player.html?vid=p1234567890"></iframe>
<script>
window.data = {
  video_page_infos: [
    {
      video_id: 'wxv_1234567890123456789',
      mp_video_trans_info: [
        {
          format_id: '10004', width: '854', height: '480', duration: '20',
          filesize: '1000',
          url: 'http://mpvideo.qpic.cn/low.mp4?x=1\\x26amp;y=2',
          video_quality_wording: '\\u6d41\\u7545'
        },
        {
          format_id: '10002', width: '1280', height: '720', duration: '20',
          filesize: '2000',
          url: 'http://mpvideo.qpic.cn/high.mp4?x=1\\x26amp;y=2',
          video_quality_wording: '\\u8d85\\u6e05'
        }
      ],
      content_noencode: 'Native item',
      cover_url_16_9: 'http://mmbiz.qpic.cn/cover.jpg'
    },
    {
      video_id: 'p1234567890',
      mp_video_trans_info: [],
      cover_url_16_9: 'http://mmbiz.qpic.cn/tencent.jpg'
    }
  ]
};
</script>`;

test("decodes WeChat JavaScript and nested HTML escapes", () => {
    assert.equal(decodeWechatValue("a\\x26amp;amp;b"), "a&b");
    assert.equal(decodeWechatValue("\\u8d85\\u6e05"), "\u8d85\u6e05");
});

test("parses native, Finder, and Tencent embeds in article order", () => {
    const article = parseWechatArticle(fixture);

    assert.equal(article.title, "Safety videos");
    assert.deepEqual(article.items.map((item) => item.kind), [
        "mpvideo",
        "finder",
        "tencent_video",
    ]);
    assert.equal(article.items[0].formats[0].width, 1280);
    assert.equal(article.items[0].formats[0].url, "https://mpvideo.qpic.cn/high.mp4?x=1&y=2");
    assert.equal(article.items[2].cover, "https://mmbiz.qpic.cn/tencent.jpg");
});

test("resolves Tencent Video to browser-downloadable HTTPS CDN candidates", async () => {
    const fetchImpl = async () => new Response(
        `QZOutputJson=${JSON.stringify({
            vl: {
                vi: [{
                    fn: "video.mp4",
                    fvkey: "key",
                    vw: 1280,
                    vh: 720,
                    td: "30.5",
                    ul: { ui: [{ url: "http://203.0.113.10/path/" }] },
                }],
            },
        })};`,
        { status: 200 },
    );

    const result = await resolveTencentVideo({
        id: "p1234567890",
        kind: "tencent_video",
    }, fetchImpl);

    assert.equal(result.urls[0], "https://ugcws.video.gtimg.com/path/video.mp4?vkey=key");
    assert.equal(result.urls[1], "https://apd-vlive.apdcdn.tc.qq.com/path/video.mp4?vkey=key");
    assert.equal(result.width, 1280);
    assert.equal(result.duration, 30.5);
});

test("builds a direct video picker without proxy markers", () => {
    const result = buildWechatArticleResult({
        title: "Article",
        unavailableCount: 1,
        items: [
            {
                kind: "mpvideo",
                urls: ["https://mpvideo.qpic.cn/one.mp4"],
                duration: 20,
            },
            {
                kind: "tencent_video",
                urls: ["https://ugcws.video.gtimg.com/two.mp4"],
                duration: 30,
            },
        ],
    }, "article-id");

    assert.equal(result.picker.length, 2);
    assert.equal(result.picker[0].requiresProxy, undefined);
    assert.equal(result.picker[1].requiresProxy, undefined);
    assert.equal(result.unavailableCount, 1);
    assert.equal(result.duration, 50);
});
