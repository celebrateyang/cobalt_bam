import UrlPattern from "url-pattern";

export const audioIgnore = new Set(["vk", "ok", "loom"]);
export const hlsExceptions = new Set(["amazon", "dailymotion", "vimeo", "rutube", "bsky", "youtube", "cctv", "bjnews", "niconico", "weibo"]);

export const services = {
    amazon: {
        patterns: [
            "live/video/:id",
            "vdp/:id",
        ],
    },
    analdin: {
        patterns: [
            "videos/:id/:slug",
            "videos/:id",
            "embed/:id",
        ],
        tld: "xxx",
    },
    bilibili: {
        patterns: [
            "video/:comId",
            "video/:comId?p=:partId",
            "bangumi/play/:epId",
            "_shortLink/:comShortLink",
            "_tv/:lang/video/:tvId",
            "_tv/video/:tvId"
        ],
        subdomains: ["m"],
    },
    cctv: {
        patterns: [
            ":year/:month/:day/:id.shtml",
        ],
        subdomains: "*",
        altDomains: ["12371.cn"],
        tld: ["com", "cn"],
    },
    bsky: {
        patterns: [
            "profile/:user/post/:post"
        ],
        tld: "app",
    },
    bjnews: {
        patterns: [
            "detail/:id.html",
        ],
        tld: "com.cn",
        subdomains: ["m"],
    },
    ourjiangsu: {
        patterns: [
            "a/:date/:id.shtml",
            "video/:date/:id.shtml",
        ],
    },
    dailymotion: {
        patterns: ["video/:id"],
    },
    deeplearningai: {
        patterns: [
            "courses/:courseSlug/lesson/:lessonId/:lessonSlug",
        ],
        tld: "ai",
        subdomains: ["learn"],
    },
    douyin: {
        patterns: [
            "video/:id",
            "note/:id",
            "share/video/:id",
            "share/note/:id",
            "share/slides/:id",
            "_shortLink/:shortLink"
        ],
        subdomains: ["v", "www"],
    },
    facebook: {
        patterns: [
            "_shortLink/:shortLink",
            ":username/videos/:caption/:id",
            ":username/videos/:id",
            "reel/:id",
            "share/:shareType/:id"
        ],
        subdomains: ["web", "m"],
        altDomains: ["fb.watch"],
    },
    haokan: {
        patterns: [
            "v?vid=:vid",
            "v?vid=:vid&tab=:tab",
            "videoui/page/videoland?context=:context",
            "videoui/page/videoland?isBdboxShare=:isBdboxShare&context=:context&pd=:pd",
        ],
        tld: "com",
    },
    instagram: {
        patterns: [
            "p/:postId",
            "tv/:postId",
            "reel/:postId",
            "reels/:postId",
            "stories/:username/:storyId",

            /*
                share & username links use the same url pattern,
                so we test the share pattern first, cuz id type is different.
                however, if someone has the "share" username and the user
                somehow gets a link of this ancient style, it's joever.
            */

            "share/:shareId",
            "share/p/:shareId",
            "share/reel/:shareId",

            ":username/p/:postId",
            ":username/reel/:postId",
        ],
        altDomains: ["ddinstagram.com"],
    },
    kuaishou: {
        patterns: [
            "short-video/:id",
            "video/:id",
            "f/:shareToken",
            "_shortLink/:shortLink"
        ],
        subdomains: ["v", "www"],
    },
    kugou: {
        patterns: [
            "mixsong/:id.html",
        ],
        subdomains: ["m"],
    },
    loom: {
        patterns: ["share/:id", "embed/:id"],
    },
    ok: {
        patterns: [
            "video/:id",
            "videoembed/:id"
        ],
        tld: "ru",
    },
    pinterest: {
        patterns: [
            "pin/:id",
            "pin/:id/:garbage",
            "url_shortener/:shortLink"
        ],
    },
    podcast: {
        patterns: [
            "episode?data=:data",
        ],
        tld: "online",
        subdomains: ["podcast"],
        altDomains: ["podcast.freesavevideo.online"],
    },
    newgrounds: {
        patterns: [
            "portal/view/:id",
            "audio/listen/:audioId",
        ]
    },
    niconico: {
        patterns: [
            "watch/:id",
            "shorts/:id",
        ],
        tld: "jp",
        subdomains: ["sp", "embed"],
    },
    naver: {
        patterns: [
            "_shortLink/:shortLink",
            "shorts?mediaId=:mediaId",
            "shorts?mediaId=:mediaId&serviceType=:serviceType",
            "shorts?mediaId=:mediaId&serviceType=:serviceType&mediaType=:mediaType",
            "contents?mediaId=:mediaId",
            "contents?mediaId=:mediaId&serviceType=:serviceType",
            "contents?mediaId=:mediaId&serviceType=:serviceType&mediaType=:mediaType",
        ],
        subdomains: ["m", "clip"],
    },
    reddit: {
        patterns: [
            "comments/:id",

            "r/:sub/comments/:id",
            "r/:sub/comments/:id/:title",
            "r/:sub/comments/:id/comment/:commentId",

            "user/:user/comments/:id",
            "user/:user/comments/:id/:title",
            "user/:user/comments/:id/comment/:commentId",

            "r/u_:user/comments/:id",
            "r/u_:user/comments/:id/:title",
            "r/u_:user/comments/:id/comment/:commentId",

            "r/:sub/s/:shareId",

            "video/:shortId",
        ],
        subdomains: "*",
    },
    rutube: {
        patterns: [
            "video/:id",
            "play/embed/:id",
            "shorts/:id",
            "yappy/:yappyId",
            "video/private/:id?p=:key",
            "video/private/:id"
        ],
        tld: "ru",
    },
    snapchat: {
        patterns: [
            ":shortLink",
            "spotlight/:spotlightId",
            "add/:username/:storyId",
            "u/:username/:storyId",
            "add/:username",
            "u/:username",
            "t/:shortLink",
            "o/:spotlightId",
        ],
        subdomains: ["t", "story"],
    },
    soundcloud: {
        patterns: [
            ":author/:song/s-:accessKey",
            ":author/:song",
            ":shortLink"
        ],
        subdomains: ["on", "m"],
    },
    streamable: {
        patterns: [
            ":id",
            "o/:id",
            "e/:id",
            "s/:id"
        ],
    },
    tiktok: {
        patterns: [
            ":user/video/:postId",
            "i18n/share/video/:postId",
            ":shortLink",
            "t/:shortLink",
            ":user/photo/:postId",
            "v/:postId.html"
        ],
        subdomains: ["vt", "vm", "m", "t"],
    },
    threads: {
        patterns: [
            "@:username/post/:postId",
            "t/:postId",
        ],
        altDomains: ["threads.net"],
    },
    toutiao: {
        patterns: [
            "video/:id",
            "item/:id",
            "is/:shortLink",
            ":shortLink",
        ],
        subdomains: ["m"],
        altDomains: ["toutiaoimg.cn"],
    },
    tumblr: {
        patterns: [
            "post/:id",
            "blog/view/:user/:id",
            ":user/:id",
            ":user/:id/:trackingId"
        ],
        subdomains: "*",
    },
    twitch: {
        patterns: [":channel/clip/:clip"],
        tld: "tv",
        subdomains: ["clips", "www", "m"],
    },
    twitter: {
        patterns: [
            ":user/status/:id",
            ":user/status/:id/video/:index",
            ":user/status/:id/photo/:index",
            ":user/status/:id/mediaviewer",
            ":user/status/:id/mediaViewer",
            "i/bookmarks?post_id=:id"
        ],
        subdomains: ["mobile"],
        altDomains: ["x.com", "vxtwitter.com", "fixvx.com"],
    },
    vimeo: {
        patterns: [
            ":id",
            "video/:id",
            ":id/:password",
            "/channels/:user/:id",
            "groups/:groupId/videos/:id"
        ],
        subdomains: ["player"],
    },
    weibo: {
        patterns: [
            "_shortLink/:shortLink",
            "show/:oid",
            "show?fid=:fid",
            "tv/show/:oid",
            ":uid/:mblogId",
        ],
        subdomains: ["video", "h5.video"],
    },
    vk: {
        patterns: [
            "video:ownerId_:videoId",
            "clip:ownerId_:videoId",
            "video:ownerId_:videoId_:accessKey",
            "clip:ownerId_:videoId_:accessKey",

            // links with a duplicate author id and/or zipper query param
            "clips:duplicateId",
            "videos:duplicateId",
            "search/video"
        ],
        subdomains: ["m"],
        altDomains: ["vkvideo.ru", "vk.ru"],
    },
    xiaohongshu: {
        patterns: [
            "explore/:id?xsec_token=:token",
            "explore/:id",
            "discovery/item/:id?xsec_token=:token",
            "discovery/item/:id",
            ":shareType/:shareId",
        ],
        altDomains: ["rednote.com", "xhslink.com"],
    },
    zhshjn: {
        patterns: [
            "vodplay/:id-:sid-:nid.html",
        ],
    },
    youtube: {
        patterns: [
            "watch?v=:id",
            "embed/:id",
            "watch/:id",
            "v/:id"
        ],
        subdomains: ["music", "m"],
    }
}

Object.values(services).forEach(service => {
    service.patterns = service.patterns.map(
        pattern => new UrlPattern(pattern, {
            segmentValueCharset: UrlPattern.defaultOptions.segmentValueCharset + '@\\.:'
        })
    )
})
