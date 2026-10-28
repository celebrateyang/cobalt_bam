import type { SeoLandingPage, SeoLandingLocaleContent } from './landing-pages';

export type DownloadPlatform = 'rutube' | 'bluesky' | 'vk' | 'threads' | 'streamable' | 'twitch';
export type PlatformDownloadConfig = {
    id: DownloadPlatform;
    name: string;
    slug: string;
    languages: string[];
    accent: string;
    placeholder: string;
    formats: string[];
};

export const platformDownloadConfigs: PlatformDownloadConfig[] = [
    { id: 'rutube', name: 'RUTUBE', slug: 'rutube-video-downloader', languages: ['en', 'ru'], accent: '#356fc5', placeholder: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/', formats: ['rutube.ru/video/VIDEO_ID/', 'rutube.ru/shorts/VIDEO_ID/', 'rutube.ru/play/embed/VIDEO_ID'], },
    { id: 'bluesky', name: 'Bluesky', slug: 'bluesky-video-downloader', languages: ['en'], accent: '#1682d4', placeholder: 'https://bsky.app/profile/handle.bsky.social/post/POST_ID', formats: ['bsky.app/profile/HANDLE/post/POST_ID', 'bsky.app/profile/did:plc:IDENTIFIER/post/POST_ID'], },
    { id: 'vk', name: 'VK Video', slug: 'vk-video-downloader', languages: ['en', 'ru'], accent: '#2874cf', placeholder: 'https://vkvideo.ru/video-123456_456789', formats: ['vkvideo.ru/videoOWNER_ID_VIDEO_ID', 'vk.com/videoOWNER_ID_VIDEO_ID', 'vk.ru/clipOWNER_ID_VIDEO_ID'], },
    { id: 'threads', name: 'Threads', slug: 'threads-video-downloader', languages: ['en'], accent: '#737373', placeholder: 'https://www.threads.com/@username/post/POST_ID', formats: ['threads.com/@USERNAME/post/POST_ID', 'threads.net/@USERNAME/post/POST_ID', 'threads.com/t/POST_ID'], },
    { id: 'streamable', name: 'Streamable', slug: 'streamable-video-downloader', languages: ['en'], accent: '#236fc4', placeholder: 'https://streamable.com/abc123', formats: ['streamable.com/VIDEO_ID', 'streamable.com/e/VIDEO_ID', 'streamable.com/o/VIDEO_ID'], },
    { id: 'twitch', name: 'Twitch Clips', slug: 'twitch-clip-downloader', languages: ['en'], accent: '#8854ca', placeholder: 'https://clips.twitch.tv/CLIP_SLUG', formats: ['clips.twitch.tv/CLIP_SLUG', 'twitch.tv/CHANNEL/clip/CLIP_SLUG'], },
];

export const getPlatformDownloadConfig = (slug: string) => platformDownloadConfigs.find(item => item.slug === slug);

function english(content: Omit<SeoLandingLocaleContent, 'disclaimer' | 'faqTitle'>): SeoLandingLocaleContent {
    return {
        ...content,
        faqTitle: 'Questions before you save',
        disclaimer: 'Save only public content you own or have permission to download. FreeSaveVideo is independent of the source platform. Deleted, private and DRM-protected media cannot be recovered here.',
    };
}

const rutube = english({
    metaTitle: 'RUTUBE Video Downloader - Save Video and Shorts as MP4 | FreeSaveVideo',
    metaDescription: 'Paste a public RUTUBE video or Shorts link to prepare an MP4. Learn which links to use, how stream processing works, and where to save the finished file.',
    metaKeywords: ['rutube video downloader', 'rutube to mp4', 'download rutube shorts'],
    h1: 'Save a RUTUBE video as an MP4',
    lede: 'Keep a public RUTUBE video as a file you can open in your own player. Paste one video or Shorts link; the downloader prepares the available stream for saving.',
    heroTags: ['Video and Shorts links', 'Available source quality', 'MP4 output'],
    supportedLinksTitle: 'Start with the video, not the channel',
    supportedLinks: [
        { title: 'A public video', description: 'Copy the full rutube.ru/video/ address from an individual video page.' },
        { title: 'A specific Short', description: 'Use rutube.ru/shorts/ followed by the video ID. The Shorts feed itself does not identify a video.' },
        { title: 'An embedded player', description: 'A rutube.ru/play/embed/ address identifies the same individual video. Channel and playlist pages are outside this form.' },
    ],
    stepsTitle: 'From a RUTUBE link to a local file',
    steps: ['Open the individual public video or Short and copy its full page link.', 'Paste the link above and start preparing the download. Follow processing in the task queue.', 'Save the completed result, then open the MP4 to check its picture and source sound.'],
    featuresTitle: 'A file for your player',
    features: ['A specific video or Short rather than a channel-wide archive.', 'An MP4 prepared from an available public stream.', 'Source-dependent quality and sound; no upscaling or missing-audio reconstruction.'],
    sections: [
        { title: 'App offline viewing and an MP4 are different', paragraphs: ['A video cached inside an app is not the same as a file in your Downloads folder. This workflow prepares an MP4 for saving and playback outside the source app.', 'Being able to watch a video in your own RUTUBE account does not establish public access for the downloader. Region and source access restrictions still apply.'] },
        { title: 'Why preparation can take a while', paragraphs: ['RUTUBE can deliver a video as many stream segments. They need to be collected into a playable file before saving. Duration, source availability and network conditions affect the wait.', 'Keep the page open while processing. A task appearing in the queue means it has started, not that a complete MP4 is already on your device.'] },
    ],
    faqs: [
        { q: 'Can I save RUTUBE Shorts?', a: 'This form accepts individual public /shorts/ links. A result depends on the source exposing an accessible stream; the Shorts feed, removed clips and restricted videos are not supported inputs.' },
        { q: 'Can I choose any resolution?', a: 'The result can only use a rendition available from RUTUBE. A quality preference cannot create 1080p or 4K if the source does not expose it.' },
        { q: 'Does this download a whole RUTUBE playlist?', a: 'No. This page handles one video link at a time and does not expand a RUTUBE channel or playlist.' },
        { q: 'Why does a playable RUTUBE link still fail?', a: 'Public pages may have region or access restrictions, or the stream may be temporarily unavailable. Check the original video, copy its page URL again and retry later if it still plays publicly.' },
        { q: 'Where is the finished MP4?', a: 'Follow the queue through processing and use Save when a result is ready. Your browser controls the final destination, usually Downloads. On a phone, check the browser downloads or Files app before looking in the photo gallery.' },
    ],
});

const bluesky = english({
    metaTitle: 'Bluesky Video Downloader - Save Media from a Post | FreeSaveVideo',
    metaDescription: 'Save an available video from a public Bluesky post. Use the original bsky.app post link and distinguish native video, photos, GIFs and external embeds.',
    metaKeywords: ['bluesky video downloader', 'download bluesky video', 'bsky video download'],
    h1: 'Keep the video from a Bluesky post',
    lede: 'Copy the link to one public Bluesky post. FreeSaveVideo reads the attached media and prepares an available native video for saving as MP4; photo posts and supported GIF links have their own media results.',
    heroTags: ['Original post link', 'Native video to MP4', 'Media-aware results'],
    supportedLinksTitle: 'The post tells us what to save',
    supportedLinks: [
        { title: 'A handle-based post', description: 'Use bsky.app/profile/HANDLE/post/POST_ID. A custom-domain handle can appear in the HANDLE position; keep the complete link.' },
        { title: 'A DID-based post', description: 'A shared post link can use did:plc:... in place of the handle. Paste the address as copied.' },
        { title: 'One post, not a profile', description: 'A profile page, feed or raw video CDN address is not a source post for this form.' },
    ],
    stepsTitle: 'Save the media attached to a post',
    steps: ['Open the Bluesky post and copy its link from the Share menu.', 'Paste the post link above. If several media items are returned, choose the ones you need.', 'Save the prepared media and check its file type: video is MP4, while a photo or supported GIF is a different result.'],
    featuresTitle: 'Read the result by media type',
    features: ['Native public video can be prepared as MP4.', 'Photo attachments can return an image or a selectable image set.', 'Supported Tenor embeds can return GIF; arbitrary external videos are not native Bluesky uploads.'],
    sections: [
        { title: 'A link preview is not a video attachment', paragraphs: ['A post linking to another website may show a play icon or preview without containing a native Bluesky video. Use the original video platform for that external content.', 'Supported GIF embeds are handled separately. Do not assume that every animated post returns MP4, or that an image result means a requested video was downloaded.'] },
        { title: 'Keep the original post context', paragraphs: ['The post link supplies the media attachment and identity information. A temporary playlist or CDN URL may expire and is not accepted by this form.', 'Quoted posts and posts with unavailable attachments may not expose the same media as the page preview. Check that the returned item belongs to the post you intended to save.'] },
    ],
    faqs: [
        { q: 'Can I download from a custom Bluesky handle?', a: 'Use the bsky.app post link, including the complete custom handle between /profile/ and /post/. Do not replace it with the profile homepage or the custom website address.' },
        { q: 'Why did I get images instead of a video?', a: 'The post may contain photos rather than a native video, or its accessible attachment may differ from the preview. Images are separate results and are not converted into a video by this page.' },
        { q: 'Does it save every GIF as MP4?', a: 'No. A supported Tenor GIF embed can return GIF, while native video returns a video result. Other external embeds may be unavailable.' },
        { q: 'Can it download an entire Bluesky account?', a: 'No. Paste one public post link. Profiles, feeds and account-wide archives are not supported by this page.' },
        { q: 'Why is a public post unavailable?', a: 'The post or its media may have been removed, restricted or made unavailable to public API access. Reopen the original post and retry its full link. This tool cannot restore deleted media.' },
    ],
});

const vk = english({
    metaTitle: 'VK Video Downloader - Save Public Videos and Clips | FreeSaveVideo',
    metaDescription: 'Paste one public VK or VK Video link to save an available MP4. Covers video and Clip links, source quality, complete IDs and common access failures.',
    metaKeywords: ['vk video downloader', 'vkvideo downloader', 'download vk clips'],
    h1: 'Save a public VK video or Clip',
    lede: 'Use the full link to an individual video on VK or VK Video. FreeSaveVideo looks for an available MP4 rendition, keeping the source picture and sound when provided.',
    heroTags: ['VK and VK Video', 'Videos and Clips', 'Available MP4 renditions'],
    supportedLinksTitle: 'Different domains, one specific video',
    supportedLinks: [
        { title: 'VK Video links', description: 'Use vkvideo.ru/videoOWNER_ID_VIDEO_ID for one video, or its individual /clip address.' },
        { title: 'VK links', description: 'The equivalent vk.com and vk.ru video or Clip page links are accepted. Keep a minus sign in the owner ID.' },
        { title: 'Keep the complete shared link', description: 'Copy the individual video address with its full ID and any share parameters. Profiles, wall posts, search results and playlists are not inputs for this page.' },
    ],
    stepsTitle: 'Save a VK video in three steps',
    steps: ['Open the individual public video or Clip, then copy its complete link.', 'Paste the link above and prepare the available video. Follow the result in the download queue.', 'Save the MP4 when it is ready and open the file to check playback and sound.'],
    featuresTitle: 'Use what VK actually exposes',
    features: ['Individual public videos and Clip links on supported VK domains.', 'An available MP4 rendition rather than a promise of original upload quality.', 'A video workflow; this page does not offer VK Music or playlist expansion.'],
    sections: [
        { title: 'Do not shorten the video ID', paragraphs: ['VK video links identify both an owner and a video. Removing the owner, its minus sign or part of the ID can point to different content or prevent parsing.', 'If a friend shared a video inside a wall post, open the actual video first and copy its video link. The wall post URL is not a substitute here.'] },
        { title: 'Quality and access come from the source', paragraphs: ['Only exposed MP4 renditions can be saved. A preferred resolution is a request, not a way to upscale a lower-quality source.', 'Private videos, region restrictions and videos still being processed can prevent a result even if a page link looks valid.'] },
    ],
    faqs: [
        { q: 'Do vk.com and vkvideo.ru links both work?', a: 'This form accepts individual video and Clip page links on vk.com, vk.ru and vkvideo.ru, including supported mobile hostnames. Public media availability is still required.' },
        { q: 'Can I download VK Clips?', a: 'Use the full /clipOWNER_ID_VIDEO_ID link for an individual public Clip. A Clips feed or creator profile does not identify a single downloadable item.' },
        { q: 'Can I use a wall post or playlist URL?', a: 'No. Open the specific video and copy its video or Clip link. This page does not expand wall posts, playlists or whole accounts.' },
        { q: 'Why is my requested quality missing?', a: 'VK may not expose an MP4 at that resolution. The current source renditions determine what can be returned; unavailable quality cannot be created.' },
        { q: 'Can this page save VK Music or private videos?', a: 'This page is for public video and Clip links. VK Music, private videos and content requiring source-account access are outside its scope.' },
    ],
});

const threads = english({
    metaTitle: 'Threads Video Downloader - Save Videos and Photos from a Post | FreeSaveVideo',
    metaDescription: 'Paste a public Threads post link to save available videos or photos. Supports current and older post URLs, with individual media selection when returned.',
    metaKeywords: ['threads video downloader', 'download threads video', 'threads photo download'],
    h1: 'Save the media from a Threads post',
    lede: 'One Threads post can hold a video, photos or several media items. Paste the original post link to get the available attachments, then select what you want to keep.',
    heroTags: ['threads.com and threads.net', 'Video and photo results', 'Select returned attachments'],
    supportedLinksTitle: 'Use a post link from either domain',
    supportedLinks: [
        { title: 'Current post links', description: 'Copy threads.com/@USERNAME/post/POST_ID from the post Share menu.' },
        { title: 'Older Threads links', description: 'Keep a threads.net post link as shared; the form accepts the older hostname too.' },
        { title: 'Short post links', description: 'A threads.com/t/POST_ID link can identify one post without a visible username. Profile and feed addresses are not accepted.' },
    ],
    stepsTitle: 'Choose the attachments you want',
    steps: ['Open the original Threads post, use Share and copy its link.', 'Paste the link above. Review the returned video or photo choices when the post exposes several attachments.', 'Save each selected result and check its media type. Starting a task is not the same as finishing the save.'],
    featuresTitle: 'A post is more than one preview',
    features: ['A single available video can return MP4.', 'A photo-only post can return an image result.', 'Multiple exposed attachments can appear as selectable video and photo items.'],
    sections: [
        { title: 'A mixed post is not a conversation archive', paragraphs: ['Media choices belong to the submitted post. Replies, the parent conversation and recommended posts are not a playlist to download.', 'Check the returned attachments before saving. A photo result is not a substitute for a video that the source did not expose.'] },
        { title: 'Use the original link after an access failure', paragraphs: ['A Threads page may be public while requests for its media are temporarily limited. Reopen the post, copy its full link and try again later if the source still plays.', 'Private, removed or inaccessible posts cannot be recovered. Do not replace the post URL with a temporary CDN resource.'] },
    ],
    faqs: [
        { q: 'Do old threads.net links still work here?', a: 'Yes. The form accepts supported post links on threads.net and threads.com. Paste the complete link as supplied, including the post ID.' },
        { q: 'Can I save several videos from one post?', a: 'When the source exposes multiple attachments and the parser returns them, review the picker and select the video or photo items you need. This is not whole-conversation downloading.' },
        { q: 'Can I download just the photos?', a: 'Available photo attachments can be returned as images. On a mixed post, select the returned photo items rather than assuming every result is an MP4.' },
        { q: 'Why is there no video in the result?', a: 'The post may contain only photos, an external preview or inaccessible media. Verify the original post. A thumbnail does not prove a downloadable video exists.' },
        { q: 'Can this page save a profile or all replies?', a: 'No. It processes one specific public post. Profiles, feeds, private accounts and complete discussion archives are outside this workflow.' },
    ],
});

const streamable = english({
    metaTitle: 'Streamable Video Downloader - Save a Clip as MP4 | FreeSaveVideo',
    metaDescription: 'Save an available public Streamable clip as MP4. Paste its video or embedded-player link and learn about source quality, deleted clips and browser saving.',
    metaKeywords: ['streamable video downloader', 'streamable to mp4', 'download streamable clip'],
    h1: 'Keep a Streamable clip as an MP4',
    lede: 'Paste the link to one public Streamable clip. FreeSaveVideo reads the available MP4 files so you can save the clip and play it outside the embedded player.',
    heroTags: ['Clip and embed links', 'MP4 when available', 'Source sound retained'],
    supportedLinksTitle: 'The same clip, shared in different ways',
    supportedLinks: [
        { title: 'The original clip page', description: 'Copy streamable.com/VIDEO_ID. Use the clip page rather than a screenshot or a discussion that embeds it.' },
        { title: 'An embedded player', description: 'The /e/VIDEO_ID and /o/VIDEO_ID player forms identify one clip too.' },
        { title: 'A complete source link', description: 'Paste the Streamable page URL rather than an expiring MP4 resource, a profile or multiple clips at once.' },
    ],
    stepsTitle: 'From embedded clip to saved MP4',
    steps: ['Open the Streamable clip itself and copy its page or embedded-player URL.', 'Paste the link above and prepare the available MP4 through the download flow.', 'Save the ready file, then use your browser download list to open it and check playback.'],
    featuresTitle: 'Keep the clip, including its available sound',
    features: ['A public clip page or supported embedded-player address.', 'An available standard or mobile MP4 rendition, depending on the source and quality preference.', 'Source audio remains part of the video when present; silent originals remain silent.'],
    sections: [
        { title: 'Mobile and standard MP4 are source renditions', paragraphs: ['Streamable can expose a mobile MP4 and a standard MP4. The result depends on which files exist and the quality preference used by the downloader.', 'Selecting a higher preference cannot restore a missing source file or create a higher resolution. An embedded player may also display a lower rendition than the source makes available.'] },
        { title: 'A deleted clip cannot be fetched again', paragraphs: ['If the original clip no longer opens because it was removed or expired, a downloader cannot reconstruct it from its old link.', 'When Streamable still plays the clip but preparation fails, recopy the original URL and retry later. Distinguish a temporary request failure from a missing source.'] },
    ],
    faqs: [
        { q: 'Can I use a Streamable embed link?', a: 'Yes. This form accepts a specific clip page and the supported /e/, /o/ and /s/ player link forms. They must identify an existing public clip.' },
        { q: 'Can it restore an expired or deleted Streamable video?', a: 'No. There must be an accessible source file. A saved link or thumbnail is not a backup of the clip.' },
        { q: 'Will I get the original upload?', a: 'The result is an MP4 exposed by Streamable, not a promise of the original uploaded file or its original bitrate.' },
        { q: 'Why is there no sound?', a: 'A silent source has no sound to preserve. If the original clip plays with audio but the saved file does not, retry the original clip link and check the completed MP4.' },
        { q: 'How do I save it on a phone?', a: 'Keep the page open through preparation and use Save for the ready result. Check your browser downloads or Files app; a downloaded MP4 does not necessarily appear in the photo gallery automatically.' },
    ],
});

const twitch = english({
    metaTitle: 'Twitch Clip Downloader - Save a Public Clip as MP4 | FreeSaveVideo',
    metaDescription: 'Save a public Twitch Clip from a clips.twitch.tv or channel/clip link. Covers available source quality and the difference between Clips, live streams and VODs.',
    metaKeywords: ['twitch clip downloader', 'download twitch clips', 'twitch clip to mp4'],
    h1: 'Save one Twitch Clip as an MP4',
    lede: 'Keep a specific public Twitch Clip with its available picture and sound. Copy the Clip share link and prepare the file here, without mistaking a live channel or full broadcast for a Clip.',
    heroTags: ['Public Clips', 'Two share-link formats', 'Available source quality'],
    supportedLinksTitle: 'A Clip has its own link',
    supportedLinks: [
        { title: 'A clips.twitch.tv link', description: 'Copy clips.twitch.tv/CLIP_SLUG from the individual Clip.' },
        { title: 'A channel Clip link', description: 'A twitch.tv/CHANNEL/clip/CLIP_SLUG link identifies the same kind of individual Clip.' },
        { title: 'Live and VOD links are different', description: 'A channel homepage or twitch.tv/videos/NUMBER is not a Clip. Full broadcasts, live capture and channel-wide exports are outside this page.' },
    ],
    stepsTitle: 'Save the moment you clipped',
    steps: ['Open the individual Twitch Clip and copy its share link.', 'Paste the link above and prepare its available video. Follow the task until it is ready to save.', 'Save the MP4 and play it to confirm the Clip, picture and available sound are correct.'],
    featuresTitle: 'One Clip, with a clear boundary',
    features: ['Specific public Clips from the two supported URL forms.', 'An MP4 using one of the qualities exposed by Twitch.', 'The available source sound, without fabricating missing or muted audio.'],
    sections: [
        { title: 'Clips are not full VOD archives', paragraphs: ['A Clip is a separate short item with its own slug and share link. The full broadcast it came from is a different resource.', 'This page does not trim broadcasts, capture a live stream, export all Clips from a channel or convert them into vertical Shorts.'] },
        { title: 'Prepare a fresh link when a save expires', paragraphs: ['Twitch media access can include temporary playback information. Reusing an old media URL is less useful than preparing the original Clip link again.', 'A removed or inaccessible Clip cannot be restored here. If the original Clip still plays publicly, recopy its share link and retry.'] },
    ],
    faqs: [
        { q: 'Can I download a whole Twitch VOD?', a: 'No. This page handles individual public Clips. A /videos/ URL, live channel and subscriber-only broadcast are not supported inputs.' },
        { q: 'Which Twitch Clip link should I copy?', a: 'Use clips.twitch.tv/CLIP_SLUG or twitch.tv/CHANNEL/clip/CLIP_SLUG. Open the Clip itself rather than copying the channel address.' },
        { q: 'Can I force a higher resolution?', a: 'The downloader can only use qualities that Twitch exposes for that Clip. It does not upscale, recreate the original broadcast or promise 1080p for every Clip.' },
        { q: 'Can I restore a deleted Clip or muted sound?', a: 'No. The Clip must still expose accessible media. Missing or muted source audio cannot be reconstructed by this download flow.' },
        { q: 'Does a started task mean the MP4 is saved?', a: 'No. Wait for processing to finish, then save the ready result. Your browser determines the destination; check its downloads list and play the completed file.' },
    ],
});

const rutubeRu: SeoLandingLocaleContent = {
    metaTitle: 'Скачать видео с RUTUBE и Shorts в MP4 | FreeSaveVideo',
    metaDescription: 'Вставьте ссылку на публичное видео или Shorts RUTUBE и подготовьте MP4. Поддерживаемые адреса, качество источника, обработка и сохранение файла.',
    metaKeywords: ['скачать видео с рутуба', 'rutube в mp4', 'скачать rutube shorts'],
    h1: 'Сохраните видео RUTUBE в MP4',
    lede: 'Вставьте ссылку на отдельное публичное видео или Shorts. FreeSaveVideo подготовит доступный поток для сохранения файлом, который можно открыть в своём плеере.',
    heroTags: ['Видео и Shorts', 'Качество источника', 'Файл MP4'],
    supportedLinksTitle: 'Нужна ссылка на видео, а не на канал',
    supportedLinks: [
        { title: 'Публичное видео', description: 'Скопируйте полный адрес rutube.ru/video/ со страницы отдельного ролика.' },
        { title: 'Отдельный Shorts', description: 'Используйте rutube.ru/shorts/ с идентификатором видео. Лента Shorts не определяет один ролик.' },
        { title: 'Встроенный плеер', description: 'Адрес rutube.ru/play/embed/ также указывает на отдельное видео. Каналы и плейлисты здесь не раскрываются.' },
    ],
    stepsTitle: 'От ссылки RUTUBE к файлу',
    steps: ['Откройте отдельное публичное видео или Shorts и скопируйте полный адрес.', 'Вставьте ссылку в форму и начните подготовку. Следите за обработкой в очереди.', 'Сохраните готовый MP4 и откройте его, чтобы проверить изображение и исходный звук.'],
    featuresTitle: 'Видео для вашего плеера',
    features: ['Один ролик или Shorts, а не архив всего канала.', 'MP4 из доступного публичного потока.', 'Качество и звук зависят от источника; отсутствующий звук не восстанавливается.'],
    sections: [
        { title: 'Офлайн-просмотр в приложении и MP4 отличаются', paragraphs: ['Копия внутри приложения не равна файлу в папке загрузок. Здесь доступный поток подготавливается в MP4 для сохранения и воспроизведения вне приложения.', 'Возможность смотреть ролик в своём аккаунте RUTUBE не означает, что он доступен загрузчику публично. Ограничения источника и региона сохраняются.'] },
        { title: 'Почему подготовка занимает время', paragraphs: ['RUTUBE может передавать видео множеством фрагментов. Их нужно собрать в воспроизводимый файл. Время зависит от длительности, доступности источника и соединения.', 'Не закрывайте страницу во время обработки. Появление задачи в очереди ещё не означает, что файл уже сохранён на устройстве.'] },
    ],
    faqTitle: 'Вопросы перед сохранением',
    faqs: [
        { q: 'Можно скачать Shorts с RUTUBE?', a: 'Форма принимает ссылки на отдельные публичные /shorts/. Результат зависит от доступности потока. Лента Shorts, удалённые и ограниченные ролики не подходят.' },
        { q: 'Можно получить любое разрешение?', a: 'Сохраняется только качество, которое предоставляет источник. Настройка качества не создаёт 1080p или 4K, если такого варианта нет.' },
        { q: 'Можно скачать весь плейлист?', a: 'Нет. Страница обрабатывает одну ссылку на видео и не раскрывает каналы или плейлисты RUTUBE.' },
        { q: 'Почему публичное видео не загружается?', a: 'Возможны ограничения региона или доступа, а также временная недоступность потока. Откройте исходный ролик, скопируйте ссылку заново и повторите позже, если он по-прежнему доступен публично.' },
        { q: 'Где найти готовый MP4?', a: 'Дождитесь обработки и сохраните готовый результат. Папку определяет браузер, обычно это «Загрузки». На телефоне проверьте загрузки браузера или приложение «Файлы».' },
    ],
    disclaimer: 'Сохраняйте только публичные материалы, которые принадлежат вам или разрешены к скачиванию. FreeSaveVideo не связан с RUTUBE. Удалённые, приватные и защищённые DRM материалы не восстанавливаются.',
};

const vkRu: SeoLandingLocaleContent = {
    metaTitle: 'Скачать видео и клипы ВК в MP4 | FreeSaveVideo',
    metaDescription: 'Вставьте ссылку на публичное видео или клип ВК, VK Video. Сохраните доступный MP4 и узнайте, какие адреса, качество и ограничения поддерживаются.',
    metaKeywords: ['скачать видео вк', 'скачать vk video', 'скачать клипы вк'],
    h1: 'Сохраните видео или клип ВК',
    lede: 'Вставьте полный адрес отдельного публичного видео ВК или VK Video. FreeSaveVideo найдёт доступный MP4 с исходным изображением и звуком, если они предоставлены источником.',
    heroTags: ['ВК и VK Video', 'Видео и клипы', 'Доступные MP4'],
    supportedLinksTitle: 'Разные домены, одно конкретное видео',
    supportedLinks: [
        { title: 'Ссылки VK Video', description: 'Используйте vkvideo.ru/videoOWNER_ID_VIDEO_ID или адрес отдельного /clip.' },
        { title: 'Ссылки ВК', description: 'Принимаются соответствующие ссылки vk.com и vk.ru. Сохраняйте минус перед идентификатором владельца.' },
        { title: 'Полный адрес ролика', description: 'Копируйте ссылку со всеми идентификаторами и параметрами. Стены, профили, поиск и плейлисты не подходят для этой формы.' },
    ],
    stepsTitle: 'Как сохранить видео ВК',
    steps: ['Откройте отдельное публичное видео или клип и скопируйте полную ссылку.', 'Вставьте её в форму и начните подготовку. Следите за результатом в очереди загрузок.', 'Сохраните готовый MP4 и проверьте воспроизведение и звук.'],
    featuresTitle: 'Только то, что предоставляет источник',
    features: ['Отдельные публичные видео и клипы на поддерживаемых доменах ВК.', 'Доступный вариант MP4 без обещания качества оригинальной загрузки.', 'Видео без загрузки VK Музыки или раскрытия плейлистов.'],
    sections: [
        { title: 'Не сокращайте идентификатор видео', paragraphs: ['Адрес ВК содержит идентификаторы владельца и видео. Удаление минуса или части адреса мешает определить нужный ролик.', 'Если видео находится в записи на стене, сначала откройте само видео и скопируйте его адрес. Ссылка на запись здесь не заменяет ссылку на ролик.'] },
        { title: 'Качество и доступ определяет ВК', paragraphs: ['Можно сохранить только доступный вариант MP4. Предпочтение качества не повышает разрешение исходника.', 'Приватность, региональные ограничения или незавершённая обработка видео могут помешать загрузке даже при корректном адресе.'] },
    ],
    faqTitle: 'Вопросы перед сохранением',
    faqs: [
        { q: 'Подходят vk.com и vkvideo.ru?', a: 'Принимаются ссылки на отдельные видео и клипы vk.com, vk.ru и vkvideo.ru, включая поддерживаемые мобильные домены. Материалы должны быть публично доступны.' },
        { q: 'Можно скачать клип ВК?', a: 'Используйте полный адрес /clipOWNER_ID_VIDEO_ID отдельного публичного клипа. Лента клипов или профиль не определяют один ролик.' },
        { q: 'Можно вставить запись на стене или плейлист?', a: 'Нет. Откройте конкретный ролик и скопируйте его адрес video или clip. Страница не раскрывает стены, плейлисты или аккаунты.' },
        { q: 'Почему нет выбранного качества?', a: 'ВК может не предоставлять MP4 с таким разрешением. Результат ограничен доступными вариантами источника.' },
        { q: 'Поддерживаются VK Музыка и приватные видео?', a: 'Эта страница предназначена для публичных видео и клипов. Музыка, приватные ролики и материалы с обязательным доступом через аккаунт источника не поддерживаются.' },
    ],
    disclaimer: 'Сохраняйте только публичные материалы, которые принадлежат вам или разрешены к скачиванию. FreeSaveVideo не связан с ВК. Удалённые, приватные и защищённые DRM материалы не восстанавливаются.',
};

const contents: Record<DownloadPlatform, Record<string, SeoLandingLocaleContent>> = {
    rutube: { en: rutube, ru: rutubeRu }, bluesky: { en: bluesky }, vk: { en: vk, ru: vkRu },
    threads: { en: threads }, streamable: { en: streamable }, twitch: { en: twitch },
};

export const platformDownloadLandings: SeoLandingPage[] = platformDownloadConfigs.map(config => ({
    slug: config.slug,
    locales: contents[config.id],
    supportedLinkFormats: config.formats,
}));
