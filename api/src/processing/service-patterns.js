export const testers = {
    "analdin": pattern =>
        pattern.id?.length <= 16,

    "bilibili": pattern =>
        (pattern.comId?.length <= 12 && pattern.partId?.length <= 3) ||
        (pattern.comId?.length <= 12 && !pattern.partId) ||
        pattern.epId?.length <= 16 ||
        pattern.comShortLink?.length <= 16 ||
        pattern.tvId?.length <= 24,

    "cctv": pattern =>
        pattern.year?.length === 4 &&
        pattern.month?.length <= 2 &&
        pattern.day?.length <= 2 &&
        pattern.id?.length <= 48,

    "bsky": pattern =>
        pattern.user?.length <= 128 && pattern.post?.length <= 128,

    "bjnews": pattern =>
        pattern.id?.length <= 32,

    "ourjiangsu": pattern =>
        /^\d{8}$/.test(pattern.date || "") &&
        pattern.id?.length <= 32,

    "dailymotion": pattern => pattern.id?.length <= 32,

    "douyin": pattern =>
        pattern.id?.length <= 24 ||
        pattern.shortLink?.length <= 12,

    "facebook": pattern =>
        pattern.shortLink?.length <= 11 ||
        pattern.username?.length <= 30 ||
        pattern.caption?.length <= 255 ||
        pattern.id?.length <= 20 && !pattern.shareType ||
        pattern.id?.length <= 20 && pattern.shareType?.length === 1,

    "haokan": pattern =>
        pattern.vid?.length <= 32 ||
        pattern.context?.length <= 1024,

    "instagram": pattern =>
        pattern.postId?.length <= 48 ||
        pattern.shareId?.length <= 16 ||
        (pattern.username?.length <= 30 && pattern.storyId?.length <= 24),

    "kuaishou": pattern =>
        pattern.id?.length <= 32 ||
        pattern.shortLink?.length <= 16 ||
        pattern.shareToken?.length <= 32,

    "kugou": pattern =>
        pattern.id?.length <= 32,

    "loom": pattern =>
        pattern.id?.length <= 32,

    "newgrounds": pattern =>
        pattern.id?.length <= 12 ||
        pattern.audioId?.length <= 12,

    "niconico": pattern =>
        /^(?:[a-z]{2})?\d{1,16}$/i.test(pattern.id || ""),

    "naver": pattern =>
        pattern.shortLink?.length <= 32 ||
        /^[0-9A-F]{16,64}$/i.test(pattern.mediaId || ""),

    "ok": pattern =>
        pattern.id?.length <= 16,

    "pinterest": pattern =>
        pattern.id?.length <= 128 ||
        pattern.shortLink?.length <= 32,

    "reddit": pattern =>
        pattern.id?.length <= 16 && !pattern.sub && !pattern.user ||
        (pattern.sub?.length <= 22 && pattern.id?.length <= 16) ||
        (pattern.user?.length <= 22 && pattern.id?.length <= 16) ||
        (pattern.sub?.length <= 22 && pattern.shareId?.length <= 16) ||
        (pattern.shortId?.length <= 16),

    "rutube": pattern =>
        (pattern.id?.length === 32 && pattern.key?.length <= 32) ||
        pattern.id?.length === 32 ||
        pattern.yappyId?.length === 32,

    "snapchat": pattern =>
        (pattern.username?.length <= 32 && (!pattern.storyId || pattern.storyId?.length <= 255)) ||
        pattern.spotlightId?.length <= 255 ||
        pattern.shortLink?.length <= 16,

    "soundcloud": pattern =>
        (pattern.author?.length <= 255 && pattern.song?.length <= 255) ||
        pattern.shortLink?.length <= 32,

    "streamable": pattern =>
        pattern.id?.length <= 6,

    "tiktok": pattern =>
        pattern.postId?.length <= 21 ||
        pattern.shortLink?.length <= 21,

    "threads": pattern =>
        pattern.postId?.length <= 64 &&
        (!pattern.username || pattern.username?.length <= 64),

    "toutiao": pattern =>
        pattern.id?.length <= 24 ||
        pattern.shortLink?.length <= 32,

    "tumblr": pattern =>
        pattern.id?.length < 21 ||
        (pattern.id?.length < 21 && pattern.user?.length <= 32),

    "twitch": pattern =>
        pattern.channel && pattern.clip?.length <= 100,

    "twitter": pattern =>
        pattern.id?.length < 20,

    "vimeo": pattern =>
        pattern.id?.length <= 11 && (!pattern.password || pattern.password.length < 16),

    "weibo": pattern => {
        let id = String(pattern.oid || pattern.fid || "");
        try {
            id = decodeURIComponent(id);
        } catch {
            // keep the raw id for validation
        }
        return pattern.shortLink?.length <= 32 ||
            (pattern.uid?.length <= 24 && pattern.mblogId?.length <= 32) ||
            /^1034:\d{8,24}$/.test(id);
    },

    "vk": pattern =>
        (pattern.ownerId?.length <= 10 && pattern.videoId?.length <= 10) ||
        (pattern.ownerId?.length <= 10 && pattern.videoId?.length <= 10 && pattern.videoId?.accessKey <= 18),

    "xiaohongshu": pattern =>
        pattern.id?.length <= 24 && (!pattern.token || pattern.token.length <= 64) ||
        pattern.shareId?.length <= 24 && pattern.shareType?.length === 1,

    "zhshjn": pattern =>
        pattern.id?.length <= 16 &&
        pattern.sid?.length <= 4 &&
        pattern.nid?.length <= 4,

    "youtube": pattern =>
        pattern.id?.length <= 11,
}
