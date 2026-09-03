export type LandingCapabilityContent = {
    heroTags: string[];
    facts: string[];
    supportedLinksTitle: string;
    supportedLinks: Array<{ title: string; description: string }>;
};

type LocalizedCapability = { zh: LandingCapabilityContent; en: LandingCapabilityContent };
type LinkPair = [title: string, description: string];

const capability = (
    zhTags: string[],
    zhFacts: string[],
    zhLinks: LinkPair[],
    enTags: string[],
    enFacts: string[],
    enLinks: LinkPair[],
): LocalizedCapability => ({
    zh: {
        heroTags: zhTags,
        facts: zhFacts,
        supportedLinksTitle: '支持的链接与解析结果',
        supportedLinks: zhLinks.map(([title, description]) => ({ title, description })),
    },
    en: {
        heroTags: enTags,
        facts: enFacts,
        supportedLinksTitle: 'Supported links and parse results',
        supportedLinks: enLinks.map(([title, description]) => ({ title, description })),
    },
});

const wechat = capability(
    ['视频号分享链接', '公众号文章多视频', '多条目勾选', 'MP4 保存'],
    [
        'FreeSaveVideo 会区分视频号分享页和微信公众号文章：前者提取单个视频，后者扫描文章中可识别的多个内嵌视频。',
        '文章包含多个视频时，页面会显示标题和可用 MP4 候选，用户勾选后再加入下载队列。',
    ],
    [
        ['视频号分享页', '支持 channels.weixin.qq.com 及可解析的视频号分享链接。'],
        ['微信公众号文章', '支持 mp.weixin.qq.com/s/... 文章，可识别多个内嵌视频。'],
    ],
    ['Channels shares', 'Article video scan', 'Multi-item selection', 'MP4 save'],
    [
        'FreeSaveVideo handles WeChat Channels share pages and Official Account articles differently: a Channels link yields one video, while an article is scanned for multiple recognizable embedded videos.',
        'When an article contains several videos, the page exposes the detected titles and MP4 candidates so the user can select items before adding them to the queue.',
    ],
    [
        ['WeChat Channels shares', 'Supports parseable channels.weixin.qq.com and related public share links.'],
        ['Official Account articles', 'Supports mp.weixin.qq.com/s/... articles and can detect multiple embedded videos.'],
    ],
);

const weibo = capability(
    ['微博视频地址', 'm.weibo.cn 链接', '短链接跳转', '最高可用 MP4'],
    [
        'FreeSaveVideo 支持微博正文、视频号展示页、m.weibo.cn 状态页和可解析的短链接。',
        '解析器会从微博返回的多个清晰度候选中选择尺寸或码率更高的 MP4，并保留帖子标题用于文件名。',
    ],
    [
        ['微博帖子与视频页', '支持 weibo.com、m.weibo.cn/status、m.weibo.cn/detail 等视频地址。'],
        ['微博短链接', '先跟随跳转到真实帖子，再提取可用 MP4。'],
    ],
    ['Post URLs', 'Mobile Weibo', 'Short-link resolve', 'Best MP4 candidate'],
    [
        'FreeSaveVideo supports Weibo posts, video display pages, m.weibo.cn status pages, and resolvable short links.',
        'The extractor compares the MP4 variants returned by Weibo and selects the stronger available size or bitrate while preserving the post title for the filename.',
    ],
    [
        ['Weibo posts and video pages', 'Supports weibo.com plus m.weibo.cn/status and detail URLs.'],
        ['Weibo short links', 'Resolves the redirect to the real post before extracting an available MP4.'],
    ],
);

const toutiao = capability(
    ['今日头条 video 链接', 'item 页链接', '短链接跳转', '高码率 MP4'],
    [
        '头条解析器支持 video、item 页和可解析的分享短链接，会从页面状态与播放信息中查找视频地址。',
        '存在多个视频候选时，FreeSaveVideo 按清晰度、尺寸和码率选择当前可用的更优 MP4。',
    ],
    [
        ['头条 video / item 页', '粘贴具体视频或内容页，不要使用频道首页。'],
        ['头条分享短链接', '跟随跳转并提取真实视频 ID 后解析。'],
    ],
    ['Video URLs', 'Item pages', 'Short-link resolve', 'Higher-bitrate MP4'],
    [
        'The Toutiao extractor accepts video pages, item pages, and resolvable share links, then reads page state and playback metadata for media URLs.',
        'When several candidates exist, FreeSaveVideo compares resolution, dimensions, and bitrate to choose the stronger currently available MP4.',
    ],
    [
        ['Toutiao video and item pages', 'Paste a specific video or content page instead of a channel homepage.'],
        ['Toutiao share links', 'Follows the redirect, resolves the real video ID, and parses its media.'],
    ],
);

const tiktokVideo = capability(
    ['无水印视频', 'TikTok 图集', '视频原声', 'CDN 直连备选'],
    [
        'TikTok 解析器支持具体 video 地址、vm/vt 短链接和分享链接，并优先返回可用的无水印视频 CDN 地址。',
        '如果帖子是图集，页面会展示多张图片供选择；如果解析到音乐或原声，也可单独保存音频。',
    ],
    [
        ['TikTok video 与短链接', '支持 /@user/video/... 以及 vm.tiktok.com、vt.tiktok.com 等分享地址。'],
        ['TikTok 图集帖子', '检测到多张照片时返回可勾选的图片列表。'],
    ],
    ['No-watermark video', 'Photo posts', 'Original audio', 'CDN candidates'],
    [
        'The TikTok extractor accepts specific video URLs plus vm/vt and other share links, and prioritizes an available no-watermark CDN video URL.',
        'Photo posts become a selectable image list. When music or original sound is exposed, audio can be saved separately.',
    ],
    [
        ['TikTok videos and short links', 'Supports /@user/video/... plus vm.tiktok.com and vt.tiktok.com share URLs.'],
        ['TikTok photo posts', 'Returns a selectable image list when multiple photos are detected.'],
    ],
);

const tiktokCollection = capability(
    ['Playlist 自动展开', '共享合集', '条目勾选', '批量队列'],
    [
        'FreeSaveVideo 会识别支持的 TikTok playlist ID 和共享合集页，将其中可用的视频展开为批量条目。',
        '用户可在下载前取消不需要的视频；每个条目保留自己的标题和地址，失败时可单独重试。',
    ],
    [
        ['TikTok playlist', '粘贴带 playlist 标识的公开地址，系统读取可用条目。'],
        ['TikTok 共享合集', '支持当前能从分享页读取条目的公开合集。'],
    ],
    ['Playlist expansion', 'Shared collections', 'Item selection', 'Batch queue'],
    [
        'FreeSaveVideo recognizes supported TikTok playlist IDs and shared collection pages, expanding the available videos into batch items.',
        'Users can deselect videos before download. Each item keeps its own title and URL and can be retried separately after a failure.',
    ],
    [
        ['TikTok playlists', 'Paste a public URL carrying a playlist identifier to read its available items.'],
        ['TikTok shared collections', 'Supports public collection pages whose item data is currently exposed by TikTok.'],
    ],
);

const tiktokAudio = capability(
    ['视频原声', '帖子音乐', 'MP3/Opus 依源站', '音频模式'],
    [
        '粘贴 TikTok 视频后，音频模式会优先使用帖子暴露的音乐或原声资源，而不是仅保存视频画面。',
        '输出容器取决于 TikTok 当前返回的音频格式；如果源站不提供独立音频，页面会以解析结果为准。',
    ],
    [['TikTok 视频链接', '从具体视频的 music/original sound 字段中提取可用音频。']],
    ['Original sound', 'Post music', 'Source audio format', 'Audio mode'],
    [
        'After a TikTok video URL is pasted, audio mode prioritizes the music or original-sound resource exposed by the post instead of saving only the video track.',
        'The output container depends on the audio format currently returned by TikTok. If no independent audio is exposed, the parse result is authoritative.',
    ],
    [['TikTok video URLs', 'Extracts available audio from the concrete video music or original-sound fields.']],
);

const douyinVideo = capability(
    ['抖音 video/note', 'v.douyin.com 短链接', '直连 MP4', '多路回退'],
    [
        '抖音解析器支持 video、note 和 v.douyin.com 分享短链接，会解决跳转并读取作品 ID。',
        '解析成功后优先返回可用 MP4 直连；当主路径被平台限制时，代码会尝试已配置的备用元数据或上游路径。',
    ],
    [
        ['抖音 video / note 地址', '支持具体作品页，不把用户主页当作单视频。'],
        ['v.douyin.com 分享链接', '跟随短链接到真实作品后解析 MP4。'],
    ],
    ['Video and note URLs', 'v.douyin short links', 'Direct MP4', 'Fallback routes'],
    [
        'The Douyin extractor accepts video pages, note pages, and v.douyin.com share links, resolving redirects to the real work ID.',
        'It prioritizes an available direct MP4 and can use configured metadata or upstream fallback paths when the primary route is restricted.',
    ],
    [
        ['Douyin video and note URLs', 'Supports concrete work pages rather than treating a creator profile as one video.'],
        ['v.douyin.com shares', 'Resolves the short link to the real work before extracting MP4.'],
    ],
);

const douyinAudio = capability(
    ['抖音原声', '从作品提取', '音频模式', '保留作品标题'],
    [
        '抖音音频页复用同一套 video/note/短链接解析，然后在音频模式中将可用媒体交给音频处理流程。',
        '文件名优先使用解析到的作品标题；可用音频质量取决于源视频和当前解析路径。',
    ],
    [['抖音 video、note 与短链接', '先解析具体作品，再按音频模式保存。']],
    ['Original sound extraction', 'Work URLs', 'Audio mode', 'Title-based filename'],
    [
        'The Douyin audio page reuses the video, note, and short-link resolver, then sends the available media through the audio-mode pipeline.',
        'Filenames prefer the parsed work title. Available audio quality depends on the source video and the active extraction route.',
    ],
    [['Douyin video, note, and share links', 'Resolves the concrete work first, then saves it through audio mode.']],
);

const douyinCollection = capability(
    ['合集 mix 识别', '任一作品反查合集', '批量勾选', '断点窗口'],
    [
        'FreeSaveVideo 能识别支持的抖音 mix/合集地址，也会从合集内具体作品的页面元数据尝试反查所属 mix。',
        '合集条目会转成可勾选的批量任务；当平台分页或数量限制生效时，以本次实际展开的条目为准。',
    ],
    [
        ['抖音 mix/合集地址', '读取 mix ID 并分页获取当前可用作品。'],
        ['合集内单个作品', '作品页暴露 mix 信息时，可反查合集并展开条目。'],
    ],
    ['Mix detection', 'Find mix from an item', 'Batch selection', 'Paged expansion'],
    [
        'FreeSaveVideo recognizes supported Douyin mix URLs and can also use metadata from an individual work to identify its parent mix.',
        'Collection items become selectable batch tasks. When platform pagination or limits apply, the items actually expanded in the current run are authoritative.',
    ],
    [
        ['Douyin mix URLs', 'Reads the mix ID and pages through the currently available works.'],
        ['An individual work from a mix', 'When the work exposes mix metadata, the parent collection can be identified and expanded.'],
    ],
);

const bilibiliPlaylist = capability(
    ['ugc_season 合集', '多P展开', '空间合集/列表', '批量队列'],
    [
        'Bilibili 合集解析器支持多P视频、ugc_season、空间合集/列表和旧版 media list，并会为每个条目生成可下载的 BV/p 地址。',
        '粘贴合集内任一视频时，如果视频元数据暴露所属合集，FreeSaveVideo 会反查并展开可用条目。',
    ],
    [
        ['Bilibili 多P与普通 BV', '通过 pages 和 ugc_season 数据展开分P或所属合集。'],
        ['空间合集/列表', '支持 space.bilibili.com 的 collectiondetail 和 lists 地址。'],
    ],
    ['UGC seasons', 'Multi-part expansion', 'Space collections/lists', 'Batch queue'],
    [
        'The Bilibili collection resolver supports multi-part videos, UGC seasons, space collections/lists, and legacy media lists, producing a concrete BV or p URL for each item.',
        'If any video in a collection exposes its parent collection metadata, FreeSaveVideo can identify and expand the available items.',
    ],
    [
        ['Bilibili BV and multi-part URLs', 'Uses page and UGC-season data to expand parts or the parent collection.'],
        ['Space collections and lists', 'Supports collectiondetail and lists URLs on space.bilibili.com.'],
    ],
);

const iqiyi = capability(
    ['iqiyi.com/v_*.html', '公开免费视频', '正片识别', 'MP4 输出'],
    [
        '爱奇艺解析器支持具体的 iqiyi.com/v_*.html 公开免费视频页，并通过页面视频标识查询对应的播放数据。',
        '系统会校验目标视频 ID、正片播放列表、时长与爱奇艺 CDN 地址，排除独立播放器广告片段，再由服务器将 MPEG-TS 无损封装为可播放的 MP4。VIP、付费、DRM、登录后可见或地区受限内容不受支持。',
    ],
    [['爱奇艺具体视频页', '使用包含 v_ 视频标识、无需登录即可播放的公开免费视频地址。']],
    ['iqiyi.com/v_*.html', 'Public free videos', 'Main-program detection', 'MP4 output'],
    [
        'The iQIYI extractor supports concrete public, free iqiyi.com/v_*.html video pages and resolves playback data for the requested video identifier.',
        'It validates the target video ID, program playlist, duration, and iQIYI CDN, excludes separate player ad clips, and server-remuxes MPEG-TS to playable MP4. VIP, paid, DRM, login-only, and region-restricted content is unsupported.',
    ],
    [['Concrete iQIYI video pages', 'Use a public, free playback URL containing the v_ video identifier.']],
);

const haokan = capability(
    ['haokan.baidu.com/v', 'vid 参数', '多清晰度比较', 'MP4 输出'],
    [
        '好看视频解析器从 haokan.baidu.com/v?vid=... 地址读取 vid，并查询当前可用的播放信息。',
        '存在多个播放表示时，系统会比较清晰度和码率后选择可用 MP4；首页、搜索页和 App 下载地址不是视频输入。',
    ],
    [['好看视频播放页', '使用带 vid 参数的 haokan.baidu.com/v 具体视频地址。']],
    ['haokan.baidu.com/v', 'vid parameter', 'Quality comparison', 'MP4 output'],
    [
        'The Haokan extractor reads the vid from a haokan.baidu.com/v?vid=... URL and requests the currently available playback metadata.',
        'When several representations exist, it compares quality and bitrate to select an available MP4. Homepages, search pages, and app links are not video inputs.',
    ],
    [['Haokan playback pages', 'Use a concrete haokan.baidu.com/v URL carrying a vid parameter.']],
);

const kuaishou = capability(
    ['short-video 链接', 'v.kuaishou.com 短链接', '直接 MP4', '音频模式'],
    [
        '快手解析器支持 short-video、video 与可解析的 v.kuaishou.com 分享地址，会取得真实作品 ID。',
        '成功时返回作品的可用 MP4 地址和标题文件名；视频提供音轨时也可使用音频模式。',
    ],
    [
        ['快手 short-video / video 页', '粘贴具体公开作品地址。'],
        ['v.kuaishou.com 分享链接', '跟随跳转到真实作品后提取 MP4。'],
    ],
    ['Short-video URLs', 'v.kuaishou shares', 'Direct MP4', 'Audio mode'],
    [
        'The Kuaishou extractor supports short-video and video pages plus resolvable v.kuaishou.com shares, resolving the real work ID.',
        'A successful parse returns an available MP4 with a title-based filename. Audio mode is available when the video supplies an audio track.',
    ],
    [
        ['Kuaishou short-video and video pages', 'Paste a concrete publicly accessible work URL.'],
        ['v.kuaishou.com shares', 'Follows the redirect to the real work before extracting MP4.'],
    ],
);

const naver = capability(
    ['naver.me 短链接', 'NAVER Shorts', 'NAVER Clip', '视频/音频轨'],
    [
        'NAVER 解析器支持 naver.me 分享短链接、m.naver.com/shorts 和 clip.naver.com 视频地址，并从页面中解决 mediaId。',
        '系统会比较当前播放集中的视频表示并选择可用候选；如有独立音轨，也可交给音频下载流程。',
    ],
    [
        ['naver.me 分享链接', '跟随跳转并解决真实 NAVER 媒体地址。'],
        ['NAVER Shorts / Clip', '支持带 mediaId 的 Shorts 和具体 Clip 页。'],
    ],
    ['naver.me shares', 'NAVER Shorts', 'NAVER Clip', 'Video/audio tracks'],
    [
        'The NAVER extractor supports naver.me share links, m.naver.com/shorts pages, and clip.naver.com URLs, resolving the mediaId from the page.',
        'It compares the currently exposed video representations and selects an available candidate. A separate audio track can be used by audio mode when present.',
    ],
    [
        ['naver.me shares', 'Follows the redirect and resolves the real NAVER media URL.'],
        ['NAVER Shorts and Clip', 'Supports Shorts pages carrying a mediaId and concrete Clip pages.'],
    ],
);

const xiaohongshu = capability(
    ['小红书视频笔记', '图集多选', '实况照片视频', '音频模式'],
    [
        '小红书解析器支持 explore、discovery/item 和可解析的分享链接，会保留必要的 xsec_token 等链接参数。',
        '视频笔记返回 MP4，图集笔记返回可勾选的多张 JPG，实况照片可返回对应动态视频；视频资源还可用于音频模式。',
    ],
    [
        ['小红书视频/实况笔记', '提取可用 MP4，实况照片优先识别其动态视频。'],
        ['小红书图集笔记', '将多张图片显示为可选条目，而不是只下载首图。'],
    ],
    ['Video notes', 'Image carousels', 'Live-photo video', 'Audio mode'],
    [
        'The Xiaohongshu extractor accepts explore and discovery/item pages plus resolvable shares, preserving required parameters such as xsec_token.',
        'Video notes return MP4, image notes return a selectable JPG set, and live photos can expose their motion video. Video media can also feed audio mode.',
    ],
    [
        ['Video and live-photo notes', 'Extracts available MP4 and prioritizes motion video for live photos.'],
        ['Image carousel notes', 'Shows multiple images as selectable items instead of saving only the cover.'],
    ],
);

const instagram = capability(
    ['Reel/Post/TV', '轮播多媒体', '图片与视频', '视频音轨'],
    [
        'Instagram 解析器支持 /reel/、/p/、/tv/ 和可解析的分享地址，会从 shortcode 或页面数据中读取媒体。',
        '单视频返回 MP4，单图返回 JPG，轮播帖子会显示多个图片/视频条目供选择；视频可在有音轨时用于音频模式。',
    ],
    [
        ['Instagram Reel、Post 与 TV', '粘贴具体公开帖子地址，不支持需登录的私密内容。'],
        ['Instagram 轮播帖子', '返回可勾选的多媒体列表，保留每个条目的类型。'],
    ],
    ['Reels, posts, and TV', 'Carousel media', 'Images and video', 'Video audio track'],
    [
        'The Instagram extractor accepts /reel/, /p/, /tv/, and resolvable share URLs, reading media from shortcode or page metadata.',
        'A single video yields MP4, a single image yields JPG, and carousel posts become a selectable mixed-media list. Video audio can feed audio mode when available.',
    ],
    [
        ['Instagram Reels, posts, and TV', 'Paste a concrete public post; private content requiring login is not supported.'],
        ['Instagram carousels', 'Returns a selectable mixed-media list while preserving each item type.'],
    ],
);

const youtube = capability(
    ['Watch/Shorts/Live', 'MP4/WebM 候选', '高清音视频合并', '音频/静音模式'],
    [
        'YouTube 解析器支持 watch、youtu.be、embed、shorts 和 live 具体地址，并读取当前可用的 MP4/WebM 视频与 M4A/Opus 音频候选。',
        '高清格式只有独立视频轨时，FreeSaveVideo 会匹配容器兼容的音轨并进行合并；音频和静音模式使用各自的候选轨。',
    ],
    [
        ['YouTube 单视频地址', '支持 watch?v=、youtu.be、embed、shorts 和 live 形式。'],
        ['带 list 参数的视频地址', '可识别关联的公开 playlist，并询问是处理单视频还是整个列表。'],
    ],
    ['Watch, Shorts, and Live', 'MP4/WebM formats', 'HD audio/video merge', 'Audio and mute modes'],
    [
        'The YouTube extractor accepts watch, youtu.be, embed, Shorts, and Live URLs and reads the currently available MP4/WebM video plus M4A/Opus audio candidates.',
        'When HD video is exposed without audio, FreeSaveVideo pairs a container-compatible audio track and merges them. Audio and mute modes select their own candidate tracks.',
    ],
    [
        ['Single YouTube video URLs', 'Supports watch?v=, youtu.be, embed, Shorts, and Live forms.'],
        ['Video URLs carrying a list parameter', 'Can detect the associated public playlist and ask whether to process one video or the full list.'],
    ],
);

const youtubeShorts = capability(
    ['YouTube Shorts URL', '视频或音频', '高清轨合并', '手机/电脑'],
    [
        'YouTube Shorts 页使用与普通 YouTube 视频相同的格式选择器，支持 /shorts/ID 及可解析的 watch/youtu.be 等价地址。',
        '视频和音频分离时会在下载流程中合并；如只需要原声，可在解析前选择音频模式。',
    ],
    [['YouTube Shorts', '支持 youtube.com/shorts/ID，也可处理指向同一视频的 watch 或 youtu.be 地址。']],
    ['Shorts URLs', 'Video or audio', 'HD track merge', 'Mobile and desktop'],
    [
        'YouTube Shorts uses the same format selector as normal YouTube videos and supports /shorts/ID plus equivalent watch or youtu.be URLs.',
        'Separate video and audio tracks are merged in the download pipeline. Choose audio mode before parsing when only the original sound is needed.',
    ],
    [['YouTube Shorts', 'Supports youtube.com/shorts/ID plus watch or youtu.be URLs pointing to the same video.']],
);

const facebook = capability(
    ['Facebook Watch', 'Reels', 'fb.watch 短链接', 'HD/SD MP4'],
    [
        'Facebook 解析器支持 videos、watch、reel/reels 和 fb.watch 分享地址，并从公开页面数据中查找视频地址。',
        '当 Facebook 同时暴露 HD 和 SD 渐进式 MP4 时，页面优先使用更高质量候选；需登录、私密组或权限受限内容不受支持。',
    ],
    [
        ['Facebook Watch / Video / Reel', '粘贴具体公开视频或 Reel 地址。'],
        ['fb.watch 短链接', '跟随跳转到真实 Facebook 视频页后解析。'],
    ],
    ['Facebook Watch', 'Reels', 'fb.watch shares', 'HD/SD MP4'],
    [
        'The Facebook extractor supports videos, Watch, Reels, and fb.watch shares and looks for media URLs in public page data.',
        'When Facebook exposes both progressive HD and SD MP4, the stronger candidate is preferred. Login-only, private-group, or restricted content is not supported.',
    ],
    [
        ['Facebook Watch, video, and Reel URLs', 'Paste a concrete publicly accessible video or Reel.'],
        ['fb.watch shares', 'Follows the redirect to the real Facebook video page before parsing.'],
    ],
);

const twitter = capability(
    ['X/Twitter status', '多图多视频', 'GIF 视频化', '必要时重封装'],
    [
        'X/Twitter 解析器支持 twitter.com 和 x.com 的 status 地址，也能解决 t.co 及部分预览域名链接。',
        '帖子含多个图片、视频或 GIF 时，页面返回可选媒体列表；视频会选择更高码率变体，容器时间戳异常时则使用重封装流程。',
    ],
    [
        ['X/Twitter status 地址', '支持具体帖子及 /video/index 形式。'],
        ['多媒体帖子', '图片、GIF 和多个视频会按独立条目展示。'],
    ],
    ['X/Twitter status URLs', 'Multiple media items', 'GIF handling', 'Remux when needed'],
    [
        'The X/Twitter extractor supports status URLs on twitter.com and x.com and can resolve t.co plus selected preview-domain links.',
        'Posts with several images, videos, or GIFs become a selectable media list. Higher-bitrate video variants are preferred and timestamp issues trigger remuxing.',
    ],
    [
        ['X/Twitter status URLs', 'Supports concrete posts and /video/index forms.'],
        ['Multi-media posts', 'Images, GIFs, and multiple videos are exposed as separate selectable items.'],
    ],
);

const reddit = capability(
    ['Reddit post URL', 'v.redd.it 视频', '独立音轨合并', '原生 GIF'],
    [
        'Reddit 解析器从 comments 帖子地址读取 v.redd.it 媒体；原生 GIF 会直接保存为 GIF 文件。',
        'Reddit 视频经常将画面和声音分开。FreeSaveVideo 会检查独立 audio 或 AUDIO_128 轨，存在时合并成有声 MP4，否则保存可用视频轨。',
    ],
    [
        ['Reddit comments 帖子', '粘贴包含原生视频或 GIF 的具体帖子地址。'],
        ['v.redd.it 音视频', '自动尝试找到匹配音轨并与视频合并。'],
    ],
    ['Reddit post URL', 'v.redd.it video', 'Separate audio merge', 'Native GIF'],
    [
        'The Reddit extractor reads v.redd.it media from a comments post URL. Native GIF posts are saved directly as GIF files.',
        'Reddit often separates video and sound. FreeSaveVideo checks independent audio or AUDIO_128 tracks and merges one with video when available; otherwise it saves the available video track.',
    ],
    [
        ['Reddit comments posts', 'Paste a concrete post containing native video or GIF media.'],
        ['v.redd.it video and audio', 'Attempts to locate and merge the matching audio track automatically.'],
    ],
);

const pinterest = capability(
    ['Pinterest Pin', '视频优先', '图片回退', '原始尺寸候选'],
    [
        'Pinterest 解析器支持 /pin/ID 与可解析的 pin.it 分享链接，并查询 Pin 的媒体元数据。',
        'Pin 包含视频时返回可用 MP4；没有视频但包含图片时，会回退到可用的高尺寸图片，而不伪装成视频下载。',
    ],
    [
        ['Pinterest Pin 页', '支持 pinterest.com/pin/ID 具体 Pin 地址。'],
        ['pin.it 分享链接', '跟随跳转到真实 Pin 后判断是视频还是图片。'],
    ],
    ['Pinterest Pins', 'Video preferred', 'Image fallback', 'Larger image candidate'],
    [
        'The Pinterest extractor supports /pin/ID plus resolvable pin.it shares and requests the Pin media metadata.',
        'A video Pin yields MP4. If the Pin contains only an image, the extractor falls back to an available larger image instead of pretending it is a video.',
    ],
    [
        ['Pinterest Pin pages', 'Supports concrete pinterest.com/pin/ID URLs.'],
        ['pin.it shares', 'Resolves the real Pin and determines whether it contains video or image media.'],
    ],
);

const snapchat = capability(
    ['Spotlight', '公开 Story', '图片/视频多选', 't.snapchat 分享'],
    [
        'Snapchat 解析器支持 Spotlight、公开 Story 和可解析的 t.snapchat.com 分享链接。',
        'Spotlight 通常返回单个 MP4；公开 Story 可包含多个图片与视频 Snap，页面会将它们显示为可选条目。',
    ],
    [
        ['Snapchat Spotlight', '粘贴 spotlight/ID 具体地址以提取视频。'],
        ['Snapchat 公开 Story', '读取当前公开的 Snap 列表，区分 JPG 和 MP4。'],
    ],
    ['Spotlight', 'Public Stories', 'Image/video selection', 't.snapchat shares'],
    [
        'The Snapchat extractor supports Spotlight, public Stories, and resolvable t.snapchat.com share links.',
        'Spotlight normally yields one MP4. A public Story can contain several image and video Snaps, which become selectable items.',
    ],
    [
        ['Snapchat Spotlight', 'Paste a concrete spotlight/ID URL to extract its video.'],
        ['Snapchat public Stories', 'Reads the currently public Snap list and distinguishes JPG from MP4.'],
    ],
);

const vimeo = capability(
    ['Vimeo ID/Player', '渐进式 MP4', 'HLS/DASH 处理', '独立音轨'],
    [
        'Vimeo 解析器支持 vimeo.com/ID、player.vimeo.com/video/ID 以及代码中列出的具体播放页形式。',
        '它优先选择可用渐进式 MP4；只提供 HLS/DASH 时会展开流媒体表示，并在需要时处理独立音轨。',
    ],
    [
        ['Vimeo 视频页', '支持数字 ID 和可解析的具体播放页。'],
        ['Vimeo Player 地址', '支持 player.vimeo.com/video/ID 嵌入播放器链接。'],
    ],
    ['Vimeo ID and Player URLs', 'Progressive MP4', 'HLS/DASH handling', 'Separate audio tracks'],
    [
        'The Vimeo extractor supports vimeo.com/ID, player.vimeo.com/video/ID, and the concrete playback-page forms listed in the service matcher.',
        'It prefers an available progressive MP4. When only HLS or DASH is exposed, it expands streaming representations and handles separate audio when needed.',
    ],
    [
        ['Vimeo video pages', 'Supports numeric IDs and parseable concrete playback pages.'],
        ['Vimeo Player URLs', 'Supports player.vimeo.com/video/ID embed URLs.'],
    ],
);

const soundcloud = capability(
    ['SoundCloud 单曲', 's- 私密链接键', 'on.soundcloud.com 短链接', 'MP3/HLS 音频'],
    [
        'SoundCloud 解析器面向具体单曲地址，支持 author/track、带 s- 访问键的分享链接和可解析的 on.soundcloud.com 短链接。',
        '系统解决 track ID 和当前可用 transcoding，优先使用可用的渐进式 MP3，否则处理 HLS 音频；播放列表页不会被虚构成整列表下载。',
    ],
    [
        ['SoundCloud 单曲地址', '支持 soundcloud.com/author/track 与带访问键的单曲分享链接。'],
        ['SoundCloud 短链接', '跟随 on.soundcloud.com 跳转到真实单曲后解析。'],
    ],
    ['SoundCloud tracks', 'Secret share keys', 'on.soundcloud short links', 'MP3/HLS audio'],
    [
        'The SoundCloud extractor targets concrete tracks and supports author/track URLs, s- access-key shares, and resolvable on.soundcloud.com short links.',
        'It resolves the track ID and current transcodings, preferring progressive MP3 when available and otherwise handling HLS audio. Playlist pages are not presented as full-playlist downloads.',
    ],
    [
        ['SoundCloud track URLs', 'Supports soundcloud.com/author/track and secret-key track shares.'],
        ['SoundCloud short links', 'Follows on.soundcloud.com to the real track before parsing.'],
    ],
);

const batch = capability(
    ['多链接粘贴', '去重与预览', '可选条目', '失败单项重试'],
    [
        '批量下载器会从输入文本中提取多个 HTTPS 地址并去重，然后对每个支持的链接建立独立任务。',
        '队列保留每项的标题、来源地址、进度和失败状态；用户可取消不需要的条目，并单独重试失败项。',
    ],
    [
        ['多个支持的视频地址', '每行或文本中可包含多个 HTTPS 链接，系统自动提取和去重。'],
        ['已展开的合集/playlist 条目', '合集解析结果可直接进入同一批量队列。'],
    ],
    ['Multiple URLs', 'Deduplication and preview', 'Selectable items', 'Retry one failure'],
    [
        'The batch downloader extracts and deduplicates multiple HTTPS URLs from the input text, then creates an independent task for every supported link.',
        'The queue keeps each item title, source URL, progress, and failure state. Users can deselect items and retry one failed task without restarting completed work.',
    ],
    [
        ['Multiple supported video URLs', 'The input can contain several HTTPS links; duplicates are removed automatically.'],
        ['Expanded collection and playlist items', 'Items returned by a collection resolver can enter the same batch queue.'],
    ],
);

const playlist = capability(
    ['Bilibili 合集', '抖音 Mix', 'TikTok Playlist', 'YouTube Playlist'],
    [
        'FreeSaveVideo 的 playlist 展开接口目前对 Bilibili 合集/多P、抖音 Mix、TikTok Playlist/共享合集和 YouTube 公开 Playlist 提供专用识别。',
        '解析结果是带标题和原始地址的可选条目，不是对所有平台主页的通用爬取；具体数量受源站分页与可访问性影响。',
    ],
    [
        ['Bilibili 合集与多P', '支持 UGC season、空间列表、media list 和多P。'],
        ['抖音、TikTok 与 YouTube 列表', '支持当前能读取的 Mix、Playlist 和共享合集。'],
    ],
    ['Bilibili collections', 'Douyin Mix', 'TikTok Playlist', 'YouTube Playlist'],
    [
        'The playlist expansion API currently has dedicated recognition for Bilibili collections and parts, Douyin Mix, TikTok playlists/shared collections, and public YouTube playlists.',
        'Results are selectable items with titles and source URLs, not a universal crawler for every platform profile. Counts depend on source pagination and accessibility.',
    ],
    [
        ['Bilibili collections and parts', 'Supports UGC seasons, space lists, media lists, and multi-part videos.'],
        ['Douyin, TikTok, and YouTube lists', 'Supports currently readable Mix, Playlist, and shared-collection forms.'],
    ],
);

const youtubePlaylist = capability(
    ['list 参数识别', '公开 Playlist', '条目勾选', '独立失败重试'],
    [
        'YouTube Playlist 解析器要求地址中保留 list 参数，可从 playlist 页或带 list 的 watch 地址读取公开列表条目。',
        '检测到的视频会转成可勾选批量任务，每项再使用 YouTube 单视频格式选择器；私密、会员或不可用条目会保留为独立失败项。',
    ],
    [
        ['youtube.com/playlist?list=...', '直接读取公开 playlist 中当前可用的视频。'],
        ['youtube.com/watch?v=...&list=...', '保留 list 参数时可选择展开整个 playlist。'],
    ],
    ['list parameter', 'Public playlists', 'Item selection', 'Independent retries'],
    [
        'The YouTube playlist resolver requires the list parameter and can read a public list from either a playlist page or a watch URL carrying list.',
        'Detected videos become selectable batch tasks and each uses the normal YouTube format selector. Private, members-only, or unavailable items remain independent failures.',
    ],
    [
        ['youtube.com/playlist?list=...', 'Reads the currently available videos from a public playlist.'],
        ['youtube.com/watch?v=...&list=...', 'Keeping the list parameter allows the full playlist to be expanded.'],
    ],
);

export const landingCapabilityDetails: Record<string, LocalizedCapability> = {
    'wechat-video-download': wechat,
    'weibo-video-download': weibo,
    'toutiao-video-download': toutiao,
    'tiktok-no-watermark': tiktokVideo,
    'tiktok-collection-download': tiktokCollection,
    'tiktok-mp3-download': tiktokAudio,
    'douyin-no-watermark': douyinVideo,
    'douyin-mp3-download': douyinAudio,
    'douyin-collection-download': douyinCollection,
    'bilibili-playlist-download': bilibiliPlaylist,
    'iqiyi-video-download': iqiyi,
    'haokan-video-download': haokan,
    'kuaishou-no-watermark': kuaishou,
    'naver-video-download': naver,
    'xiaohongshu-video-download': xiaohongshu,
    'instagram-reels-download': instagram,
    'youtube-download': youtube,
    'youtube-shorts-download': youtubeShorts,
    'facebook-video-download': facebook,
    'instagram-video-download': instagram,
    'twitter-x-video-download': twitter,
    'reddit-video-download': reddit,
    'pinterest-video-download': pinterest,
    'snapchat-video-download': snapchat,
    'vimeo-video-download': vimeo,
    'soundcloud-audio-download': soundcloud,
    'batch-video-downloader': batch,
    'playlist-downloader': playlist,
    'youtube-playlist-downloader': youtubePlaylist,
};

type AdditionalCapabilityLanguage = 'de' | 'es' | 'fr' | 'ja' | 'ko' | 'ru' | 'th' | 'vi';
type ForeignBehavior =
    | 'tiktokPost'
    | 'tiktokCollection'
    | 'tiktokAudio'
    | 'naver'
    | 'instagram'
    | 'youtube'
    | 'youtubePlaylist'
    | 'facebook'
    | 'twitter'
    | 'reddit'
    | 'pinterest'
    | 'snapchat'
    | 'vimeo'
    | 'soundcloud';

type ForeignCapabilitySpec = {
    platform: string;
    inputs: string[];
    outputs: string[];
    behavior: ForeignBehavior;
};

const foreignCapabilitySpecs: Record<string, ForeignCapabilitySpec> = {
    'tiktok-no-watermark': {
        platform: 'TikTok',
        inputs: ['/@user/video/...', 'vm.tiktok.com', 'vt.tiktok.com', 'photo posts'],
        outputs: ['no-watermark MP4', 'photo files', 'original audio'],
        behavior: 'tiktokPost',
    },
    'tiktok-collection-download': {
        platform: 'TikTok Playlist',
        inputs: ['playlist URLs', 'a video inside a playlist', 'multiple TikTok URLs'],
        outputs: ['expanded item queue', 'selectable videos', 'per-item retry'],
        behavior: 'tiktokCollection',
    },
    'tiktok-mp3-download': {
        platform: 'TikTok Audio',
        inputs: ['/@user/video/...', 'vm.tiktok.com', 'vt.tiktok.com'],
        outputs: ['music track', 'original sound', 'audio-only file'],
        behavior: 'tiktokAudio',
    },
    'naver-video-download': {
        platform: 'Naver',
        inputs: ['tv.naver.com/v/...', 'Naver Shorts', 'Naver Clip'],
        outputs: ['best available MP4', 'audio track', 'title metadata'],
        behavior: 'naver',
    },
    'instagram-reels-download': {
        platform: 'Instagram Reels',
        inputs: ['/reel/...', '/reels/...', 'public share URLs'],
        outputs: ['MP4 video', 'carousel images', 'available media items'],
        behavior: 'instagram',
    },
    'instagram-video-download': {
        platform: 'Instagram',
        inputs: ['/p/...', '/reel/...', '/tv/...', 'carousel posts'],
        outputs: ['MP4 video', 'image files', 'selectable carousel items'],
        behavior: 'instagram',
    },
    'youtube-download': {
        platform: 'YouTube',
        inputs: ['watch?v=...', 'youtu.be/...', '/shorts/...', 'public live URLs'],
        outputs: ['MP4', 'audio-only', 'muted video', 'merged HD output'],
        behavior: 'youtube',
    },
    'youtube-shorts-download': {
        platform: 'YouTube Shorts',
        inputs: ['/shorts/...', 'youtu.be/...', 'watch?v=...'],
        outputs: ['MP4', 'audio-only', 'muted video'],
        behavior: 'youtube',
    },
    'youtube-playlist-downloader': {
        platform: 'YouTube Playlist',
        inputs: ['playlist?list=...', 'watch?v=...&list=...'],
        outputs: ['expanded video list', 'selectable batch', 'per-video formats and retry'],
        behavior: 'youtubePlaylist',
    },
    'facebook-video-download': {
        platform: 'Facebook',
        inputs: ['/watch/...', '/reel/...', 'fb.watch short links', 'public post URLs'],
        outputs: ['HD MP4', 'SD MP4', 'title metadata'],
        behavior: 'facebook',
    },
    'twitter-x-video-download': {
        platform: 'X (Twitter)',
        inputs: ['x.com/.../status/...', 'twitter.com/.../status/...', 'mobile status URLs'],
        outputs: ['MP4 variants', 'animated GIF video', 'multiple post media'],
        behavior: 'twitter',
    },
    'reddit-video-download': {
        platform: 'Reddit',
        inputs: ['reddit.com post URLs', 'redd.it short links', 'v.redd.it media URLs'],
        outputs: ['MP4', 'merged video with audio', 'GIF video'],
        behavior: 'reddit',
    },
    'pinterest-video-download': {
        platform: 'Pinterest',
        inputs: ['pinterest.com/pin/...', 'pin.it short links'],
        outputs: ['best available video', 'image fallback', 'GIF media'],
        behavior: 'pinterest',
    },
    'snapchat-video-download': {
        platform: 'Snapchat',
        inputs: ['Spotlight URLs', 'public Story URLs', 'share links'],
        outputs: ['video files', 'image files', 'detected Story media'],
        behavior: 'snapchat',
    },
    'vimeo-video-download': {
        platform: 'Vimeo',
        inputs: ['vimeo.com/...', 'player.vimeo.com/video/...'],
        outputs: ['progressive MP4', 'HLS/DASH streams', 'audio track'],
        behavior: 'vimeo',
    },
    'soundcloud-audio-download': {
        platform: 'SoundCloud',
        inputs: ['track URLs', 'on.soundcloud.com short links', 'secret_token links'],
        outputs: ['MP3 when exposed', 'HLS audio', 'track metadata'],
        behavior: 'soundcloud',
    },
};

type AdditionalCapabilityCopy = {
    supportedTitle: string;
    accepts: (platform: string, values: string) => string;
    result: (behavior: string, values: string) => string;
    inputTitle: string;
    outputTitle: string;
    behaviors: Record<ForeignBehavior, string>;
};

const additionalCapabilityCopy: Record<AdditionalCapabilityLanguage, AdditionalCapabilityCopy> = {
    de: {
        supportedTitle: 'Unterstützte Links und tatsächliche Ergebnisse',
        accepts: (platform, values) => `FreeSaveVideo akzeptiert für ${platform}: ${values}.`,
        result: (behavior, values) => `${behavior} Verfügbare Ergebnisse: ${values}.`,
        inputTitle: 'Akzeptierte Linktypen',
        outputTitle: 'Parser-Ergebnis',
        behaviors: {
            tiktokPost: 'Kurzlinks werden aufgelöst; der Parser bevorzugt verfügbare CDN-Videos ohne Wasserzeichen und trennt Foto-Posts sowie Originalton.',
            tiktokCollection: 'Eine Playlist-ID kann auch aus einem enthaltenen Video ermittelt und anschließend als auswählbare Warteschlange erweitert werden.',
            tiktokAudio: 'Musik- oder Originalton-Metadaten werden aus dem Beitrag gelesen und als separate Audiospur angeboten.',
            naver: 'Der Parser liest die Videoquelle aus den Seitendaten und wählt die stärkste verfügbare Auflösung statt nur die erste Variante.',
            instagram: 'Carousel-Knoten werden einzeln durchlaufen, sodass Videos und Bilder eines öffentlichen Beitrags separat auswählbar bleiben.',
            youtube: 'Adaptive Video- und Audiospuren werden erkannt und für HD-Ausgaben zusammengeführt; Audio und stummes Video bleiben eigene Optionen.',
            youtubePlaylist: 'Der list-Parameter wird ausgelesen, die öffentliche Playlist erweitert und jedes Video als unabhängige Aufgabe behandelt.',
            facebook: 'Eingebettete Wiedergabedaten werden auf HD- und SD-MP4-Varianten geprüft; private Beiträge werden nicht umgangen.',
            twitter: 'Alle Medien eines Status werden geprüft; HLS-Varianten können für eine speicherbare Ausgabe remuxt werden.',
            reddit: 'Wenn v.redd.it Bild und Ton getrennt liefert, werden beide Spuren erkannt und zu einer Datei zusammengeführt.',
            pinterest: 'Der Parser vergleicht die Medienvarianten eines Pins und fällt nur dann auf Bild oder GIF zurück, wenn kein Video vorhanden ist.',
            snapchat: 'Öffentliche Spotlight- und Story-Daten werden nach Video- und Bildressourcen durchsucht; private Inhalte bleiben ausgeschlossen.',
            vimeo: 'Progressive Dateien und Stream-Manifeste werden getrennt erkannt, damit MP4, HLS/DASH und Audio korrekt angezeigt werden.',
            soundcloud: 'Kurzlinks und secret_token werden aufgelöst; anschließend werden die verfügbaren MP3- oder HLS-Transcodings gelesen, ohne eine Playlist vorzutäuschen.',
        },
    },
    es: {
        supportedTitle: 'Enlaces compatibles y resultados reales',
        accepts: (platform, values) => `FreeSaveVideo acepta para ${platform}: ${values}.`,
        result: (behavior, values) => `${behavior} Resultados disponibles: ${values}.`,
        inputTitle: 'Tipos de enlace admitidos',
        outputTitle: 'Resultado del análisis',
        behaviors: {
            tiktokPost: 'Resuelve enlaces cortos, prioriza el video CDN sin marca de agua disponible y separa las fotos y el audio original.',
            tiktokCollection: 'También puede deducir el ID de una playlist desde uno de sus videos y expandirla en una cola seleccionable.',
            tiktokAudio: 'Lee los metadatos de música o sonido original de la publicación y ofrece la pista como audio independiente.',
            naver: 'Lee la fuente de video de los datos de la página y elige la mejor resolución disponible en vez de usar la primera variante.',
            instagram: 'Recorre cada elemento del carrusel para que los videos y las imágenes de una publicación pública se puedan elegir por separado.',
            youtube: 'Detecta pistas adaptativas de video y audio y las combina para HD; también conserva audio y video sin sonido como opciones separadas.',
            youtubePlaylist: 'Lee el parámetro list, expande la playlist pública y convierte cada video en una tarea independiente.',
            facebook: 'Examina los datos de reproducción incrustados para encontrar MP4 HD y SD sin intentar eludir publicaciones privadas.',
            twitter: 'Examina todos los medios del estado y puede remultiplexar variantes HLS para producir un archivo guardable.',
            reddit: 'Cuando v.redd.it entrega video y audio por separado, detecta ambas pistas y las combina en un solo archivo.',
            pinterest: 'Compara las variantes multimedia del Pin y solo usa imagen o GIF cuando no existe un video.',
            snapchat: 'Busca recursos de video e imagen en datos públicos de Spotlight y Story; el contenido privado queda excluido.',
            vimeo: 'Distingue archivos progresivos y manifiestos de streaming para mostrar correctamente MP4, HLS/DASH y audio.',
            soundcloud: 'Resuelve enlaces cortos y secret_token y después lee las transcodificaciones MP3 o HLS disponibles, sin fingir compatibilidad con playlists.',
        },
    },
    fr: {
        supportedTitle: 'Liens pris en charge et résultats réels',
        accepts: (platform, values) => `FreeSaveVideo accepte pour ${platform} : ${values}.`,
        result: (behavior, values) => `${behavior} Résultats disponibles : ${values}.`,
        inputTitle: 'Types de liens acceptés',
        outputTitle: 'Résultat de l’analyse',
        behaviors: {
            tiktokPost: 'Les liens courts sont résolus, la vidéo CDN sans filigrane disponible est prioritaire, et les photos ainsi que le son original sont séparés.',
            tiktokCollection: 'L’identifiant d’une playlist peut aussi être déduit depuis l’une de ses vidéos, puis la liste est développée en file sélectionnable.',
            tiktokAudio: 'Les métadonnées de musique ou de son original sont lues dans la publication afin de proposer une piste audio séparée.',
            naver: 'La source vidéo est lue dans les données de page et la meilleure résolution disponible est choisie au lieu de la première variante.',
            instagram: 'Chaque nœud du carrousel est parcouru afin que vidéos et images d’une publication publique restent sélectionnables séparément.',
            youtube: 'Les pistes adaptatives vidéo et audio sont détectées puis fusionnées pour la HD ; audio seul et vidéo muette restent disponibles séparément.',
            youtubePlaylist: 'Le paramètre list est lu, la playlist publique est développée et chaque vidéo devient une tâche indépendante.',
            facebook: 'Les données de lecture intégrées sont inspectées pour trouver les MP4 HD et SD, sans contourner les publications privées.',
            twitter: 'Tous les médias du statut sont inspectés ; les variantes HLS peuvent être remuxées en fichier enregistrable.',
            reddit: 'Lorsque v.redd.it fournit séparément vidéo et audio, les deux pistes sont détectées et fusionnées dans un fichier.',
            pinterest: 'Les variantes média du Pin sont comparées et l’image ou le GIF ne sert de repli qu’en l’absence de vidéo.',
            snapchat: 'Les données publiques Spotlight et Story sont analysées pour leurs vidéos et images ; le contenu privé reste exclu.',
            vimeo: 'Les fichiers progressifs et manifestes de streaming sont distingués pour afficher correctement MP4, HLS/DASH et audio.',
            soundcloud: 'Les liens courts et secret_token sont résolus, puis les transcodages MP3 ou HLS disponibles sont lus sans prétendre prendre en charge les playlists.',
        },
    },
    ja: {
        supportedTitle: '対応リンクと実際の解析結果',
        accepts: (platform, values) => `FreeSaveVideo が ${platform} で受け付ける形式：${values}。`,
        result: (behavior, values) => `${behavior} 利用可能な結果：${values}。`,
        inputTitle: '対応するリンク形式',
        outputTitle: '解析結果',
        behaviors: {
            tiktokPost: '短縮URLを展開し、利用可能な透かしなしCDN動画を優先し、写真投稿とオリジナル音声も分離します。',
            tiktokCollection: 'プレイリスト内の動画からIDを逆算し、選択可能なダウンロードキューへ展開できます。',
            tiktokAudio: '投稿の音楽またはオリジナルサウンド情報を読み、音声トラックを個別に提示します。',
            naver: 'ページデータから動画ソースを読み、最初の候補ではなく利用可能な最高解像度を選びます。',
            instagram: 'カルーセルの各項目を走査し、公開投稿の動画と画像を個別に選択できるようにします。',
            youtube: '映像と音声のアダプティブトラックを検出してHD出力用に結合し、音声のみと無音動画も別に残します。',
            youtubePlaylist: 'list パラメータを読み、公開プレイリストを展開して各動画を独立したタスクにします。',
            facebook: '埋め込み再生データからHD/SDのMP4を探しますが、非公開投稿を回避する処理は行いません。',
            twitter: '投稿内の全メディアを調べ、HLS形式は保存可能なファイルへリマックスできます。',
            reddit: 'v.redd.it が映像と音声を別々に配信する場合、両トラックを検出して1つのファイルに結合します。',
            pinterest: 'Pinのメディア候補を比較し、動画がない場合だけ画像またはGIFへフォールバックします。',
            snapchat: '公開SpotlightとStoryのデータから動画・画像を検出し、非公開コンテンツは対象外にします。',
            vimeo: 'プログレッシブファイルとストリームマニフェストを分けて検出し、MP4、HLS/DASH、音声を正しく表示します。',
            soundcloud: '短縮URLとsecret_tokenを解決してMP3/HLSのトランスコードを読み、未対応のプレイリスト機能は表示しません。',
        },
    },
    ko: {
        supportedTitle: '지원 링크와 실제 분석 결과',
        accepts: (platform, values) => `FreeSaveVideo가 ${platform}에서 지원하는 형식: ${values}.`,
        result: (behavior, values) => `${behavior} 사용 가능한 결과: ${values}.`,
        inputTitle: '지원 링크 형식',
        outputTitle: '분석 결과',
        behaviors: {
            tiktokPost: '단축 링크를 해석하고 사용 가능한 워터마크 없는 CDN 영상을 우선하며 사진 게시물과 원본 오디오를 분리합니다.',
            tiktokCollection: '플레이리스트 안의 영상에서도 ID를 역추적해 선택 가능한 다운로드 대기열로 펼칠 수 있습니다.',
            tiktokAudio: '게시물의 음악 또는 원본 사운드 메타데이터를 읽어 별도 오디오 트랙으로 제공합니다.',
            naver: '페이지 데이터에서 영상 소스를 읽고 첫 번째 항목이 아닌 사용 가능한 최고 해상도를 선택합니다.',
            instagram: '캐러셀 항목을 각각 순회해 공개 게시물의 영상과 이미지를 개별 선택할 수 있게 합니다.',
            youtube: '적응형 영상·오디오 트랙을 감지해 HD 결과로 병합하고 오디오 전용과 무음 영상도 별도 옵션으로 유지합니다.',
            youtubePlaylist: 'list 매개변수를 읽어 공개 플레이리스트를 펼치고 각 영상을 독립 작업으로 만듭니다.',
            facebook: '내장 재생 데이터에서 HD/SD MP4를 찾으며 비공개 게시물 제한은 우회하지 않습니다.',
            twitter: '상태의 모든 미디어를 검사하고 HLS 변형은 저장 가능한 파일로 리먹싱할 수 있습니다.',
            reddit: 'v.redd.it이 영상과 오디오를 따로 제공하면 두 트랙을 감지해 하나의 파일로 병합합니다.',
            pinterest: 'Pin의 미디어 변형을 비교하고 영상이 없을 때만 이미지나 GIF로 대체합니다.',
            snapchat: '공개 Spotlight와 Story 데이터에서 영상·이미지를 찾으며 비공개 콘텐츠는 제외합니다.',
            vimeo: '프로그레시브 파일과 스트림 매니페스트를 구분해 MP4, HLS/DASH와 오디오를 정확히 표시합니다.',
            soundcloud: '단축 링크와 secret_token을 해석한 뒤 MP3/HLS 트랜스코딩을 읽으며 지원하지 않는 플레이리스트 기능은 표시하지 않습니다.',
        },
    },
    ru: {
        supportedTitle: 'Поддерживаемые ссылки и реальные результаты',
        accepts: (platform, values) => `FreeSaveVideo принимает для ${platform}: ${values}.`,
        result: (behavior, values) => `${behavior} Доступные результаты: ${values}.`,
        inputTitle: 'Поддерживаемые типы ссылок',
        outputTitle: 'Результат разбора',
        behaviors: {
            tiktokPost: 'Короткие ссылки раскрываются, приоритет отдаётся доступному CDN-видео без водяного знака, а фото и оригинальный звук отделяются.',
            tiktokCollection: 'ID плейлиста можно определить даже по видео внутри него, после чего список разворачивается в выбираемую очередь.',
            tiktokAudio: 'Метаданные музыки или оригинального звука читаются из публикации, и дорожка предлагается отдельно.',
            naver: 'Источник видео читается из данных страницы, затем выбирается лучшее доступное разрешение, а не первый вариант.',
            instagram: 'Все узлы карусели обходятся отдельно, поэтому видео и изображения публичной публикации можно выбирать по одному.',
            youtube: 'Адаптивные видео- и аудиодорожки распознаются и объединяются для HD; аудио и видео без звука остаются отдельными вариантами.',
            youtubePlaylist: 'Параметр list читается, публичный плейлист разворачивается, а каждое видео становится независимой задачей.',
            facebook: 'Встроенные данные воспроизведения проверяются на HD- и SD-MP4 без обхода ограничений приватных публикаций.',
            twitter: 'Проверяются все медиа статуса, а варианты HLS при необходимости ремультиплексируются в сохраняемый файл.',
            reddit: 'Если v.redd.it отдаёт видео и аудио отдельно, обе дорожки распознаются и объединяются в один файл.',
            pinterest: 'Варианты медиа Pin сравниваются, а изображение или GIF используется только при отсутствии видео.',
            snapchat: 'Публичные данные Spotlight и Story проверяются на видео и изображения; приватный контент исключён.',
            vimeo: 'Прогрессивные файлы отделяются от потоковых манифестов, чтобы правильно показать MP4, HLS/DASH и аудио.',
            soundcloud: 'Короткие ссылки и secret_token раскрываются, затем читаются доступные MP3/HLS-транскодирования без ложного обещания поддержки плейлистов.',
        },
    },
    th: {
        supportedTitle: 'ลิงก์ที่รองรับและผลลัพธ์จริง',
        accepts: (platform, values) => `FreeSaveVideo รองรับรูปแบบต่อไปนี้สำหรับ ${platform}: ${values}`,
        result: (behavior, values) => `${behavior} ผลลัพธ์ที่มี: ${values}`,
        inputTitle: 'รูปแบบลิงก์ที่รองรับ',
        outputTitle: 'ผลการแยกข้อมูล',
        behaviors: {
            tiktokPost: 'ระบบแกะลิงก์แบบสั้น เลือกวิดีโอ CDN แบบไม่มีลายน้ำที่ใช้ได้ก่อน และแยกรูปภาพกับเสียงต้นฉบับออกมา',
            tiktokCollection: 'ระบบหา ID เพลย์ลิสต์ย้อนกลับจากวิดีโอภายในได้ แล้วขยายเป็นคิวที่เลือกดาวน์โหลดได้',
            tiktokAudio: 'ระบบอ่านข้อมูลเพลงหรือเสียงต้นฉบับจากโพสต์และแสดงเป็นแทร็กเสียงแยก',
            naver: 'ระบบอ่านแหล่งวิดีโอจากข้อมูลหน้าและเลือกความละเอียดสูงสุดที่ใช้ได้ แทนการเลือกตัวเลือกแรก',
            instagram: 'ระบบตรวจแต่ละรายการในคารูเซล ทำให้เลือกวิดีโอและรูปภาพจากโพสต์สาธารณะแยกกันได้',
            youtube: 'ระบบตรวจแทร็กวิดีโอและเสียงแบบ adaptive แล้วรวมเป็นไฟล์ HD พร้อมเก็บตัวเลือกเฉพาะเสียงและวิดีโอไร้เสียงไว้',
            youtubePlaylist: 'ระบบอ่านพารามิเตอร์ list ขยายเพลย์ลิสต์สาธารณะ และสร้างแต่ละวิดีโอเป็นงานอิสระ',
            facebook: 'ระบบตรวจข้อมูลเล่นที่ฝังไว้เพื่อหา MP4 แบบ HD และ SD โดยไม่ข้ามข้อจำกัดของโพสต์ส่วนตัว',
            twitter: 'ระบบตรวจสื่อทั้งหมดในสถานะ และสามารถ remux รูปแบบ HLS เป็นไฟล์ที่บันทึกได้',
            reddit: 'เมื่อ v.redd.it ส่งวิดีโอและเสียงแยกกัน ระบบจะตรวจทั้งสองแทร็กและรวมเป็นไฟล์เดียว',
            pinterest: 'ระบบเปรียบเทียบสื่อแต่ละแบบของ Pin และใช้รูปภาพหรือ GIF แทนเฉพาะเมื่อไม่มีวิดีโอ',
            snapchat: 'ระบบค้นหาวิดีโอและรูปภาพจากข้อมูล Spotlight และ Story สาธารณะ โดยไม่รองรับเนื้อหาส่วนตัว',
            vimeo: 'ระบบแยกไฟล์ progressive ออกจาก manifest สตรีม เพื่อแสดง MP4, HLS/DASH และเสียงได้ถูกต้อง',
            soundcloud: 'ระบบแกะลิงก์สั้นและ secret_token แล้วอ่าน transcoding แบบ MP3/HLS ที่มี โดยไม่อ้างว่ารองรับเพลย์ลิสต์',
        },
    },
    vi: {
        supportedTitle: 'Liên kết được hỗ trợ và kết quả thực tế',
        accepts: (platform, values) => `FreeSaveVideo chấp nhận cho ${platform}: ${values}.`,
        result: (behavior, values) => `${behavior} Kết quả có thể nhận: ${values}.`,
        inputTitle: 'Loại liên kết được hỗ trợ',
        outputTitle: 'Kết quả phân tích',
        behaviors: {
            tiktokPost: 'Liên kết rút gọn được chuyển hướng, video CDN không logo khả dụng được ưu tiên, còn bài ảnh và âm thanh gốc được tách riêng.',
            tiktokCollection: 'Có thể suy ra ID playlist từ một video bên trong rồi mở rộng thành hàng đợi có thể lựa chọn.',
            tiktokAudio: 'Thông tin nhạc hoặc âm thanh gốc được đọc từ bài đăng và cung cấp dưới dạng bản âm thanh riêng.',
            naver: 'Nguồn video được đọc từ dữ liệu trang và hệ thống chọn độ phân giải tốt nhất hiện có thay vì biến thể đầu tiên.',
            instagram: 'Từng mục carousel được duyệt để video và hình ảnh trong bài công khai vẫn có thể chọn riêng.',
            youtube: 'Các luồng video và âm thanh adaptive được phát hiện rồi ghép cho bản HD; âm thanh riêng và video tắt tiếng vẫn là tùy chọn độc lập.',
            youtubePlaylist: 'Hệ thống đọc tham số list, mở rộng playlist công khai và tạo mỗi video thành một tác vụ độc lập.',
            facebook: 'Dữ liệu phát nhúng được kiểm tra để tìm MP4 HD và SD, nhưng không vượt qua giới hạn của bài riêng tư.',
            twitter: 'Tất cả phương tiện trong trạng thái được kiểm tra; biến thể HLS có thể được remux thành tệp có thể lưu.',
            reddit: 'Khi v.redd.it cấp video và âm thanh riêng, hệ thống phát hiện cả hai luồng và ghép thành một tệp.',
            pinterest: 'Các biến thể phương tiện của Pin được so sánh; hình ảnh hoặc GIF chỉ dùng thay thế khi không có video.',
            snapchat: 'Dữ liệu Spotlight và Story công khai được quét để tìm video, hình ảnh; nội dung riêng tư bị loại trừ.',
            vimeo: 'Tệp progressive và manifest phát trực tuyến được nhận diện riêng để hiển thị đúng MP4, HLS/DASH và âm thanh.',
            soundcloud: 'Liên kết rút gọn và secret_token được giải quyết, sau đó đọc transcoding MP3/HLS khả dụng mà không giả vờ hỗ trợ playlist.',
        },
    },
};

const buildAdditionalCapability = (
    slug: string,
    lang: AdditionalCapabilityLanguage,
): LandingCapabilityContent | undefined => {
    const spec = foreignCapabilitySpecs[slug];
    if (!spec) return undefined;
    const copy = additionalCapabilityCopy[lang];
    const inputs = spec.inputs.join(', ');
    const outputs = spec.outputs.join(', ');
    const behavior = copy.behaviors[spec.behavior];
    return {
        heroTags: [...spec.inputs.slice(0, 2), ...spec.outputs.slice(0, 2)],
        facts: [copy.accepts(spec.platform, inputs), copy.result(behavior, outputs)],
        supportedLinksTitle: copy.supportedTitle,
        supportedLinks: [
            { title: copy.inputTitle, description: copy.accepts(spec.platform, inputs) },
            { title: copy.outputTitle, description: copy.result(behavior, outputs) },
        ],
    };
};

export const getLandingCapabilityContent = (
    slug: string,
    lang: string,
): LandingCapabilityContent | undefined => {
    const detail = landingCapabilityDetails[slug];
    if (!detail) return undefined;
    if (lang === 'zh') return detail.zh;
    if (lang === 'en') return detail.en;
    if (lang in additionalCapabilityCopy) {
        return buildAdditionalCapability(slug, lang as AdditionalCapabilityLanguage);
    }
    return undefined;
};
