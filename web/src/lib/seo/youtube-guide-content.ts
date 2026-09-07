import type { SeoLandingLocaleContent } from './landing-pages';

type GuideContent = Partial<SeoLandingLocaleContent> & {
    metaTitle: string;
    metaDescription: string;
    sections: Array<{ title: string; paragraphs: string[] }>;
};

export function getYoutubeGuideContent(slug: string, lang: string): GuideContent | null {
    if (!['youtube-download-guide', 'youtube-shorts-download-guide'].includes(slug)) return null;
    if (lang !== 'en' && lang !== 'zh') return null;
    const shorts = slug === 'youtube-shorts-download-guide';
    if (lang === 'zh') return {
        metaTitle: shorts ? 'YouTube Shorts 下载指南：分享链接、手机保存与排错' : 'YouTube 下载指南：链接选择、手机保存与失败排查',
        metaDescription: '分清 YouTube 视频、Shorts 与播放列表链接，了解电脑、Android 和 iPhone 保存文件的位置，并按解析、格式和保存阶段排查失败。',
        lede: shorts ? 'Shorts 是短视频页面，不是播放列表。下面从分享链接开始，说明如何保存一条 Shorts、找到手机中的文件，以及处理音频或保存失败。' : '下载没有完成时，先判断问题发生在链接识别、资源选择还是文件保存。按下面的流程检查，可以避免反复提交同一个无效地址。',
        stepsTitle: shorts ? '保存一条 Shorts 的步骤' : '从视频链接到本地文件',
        steps: [
            shorts ? '打开具体 Shorts，使用分享功能复制 youtube.com/shorts/ 后带视频 ID 的链接。' : '打开具体视频，复制 youtube.com/watch?v= 后带视频 ID 的地址，或 youtu.be 分享链接。',
            '打开对应下载器并粘贴链接。先确认识别出的内容是目标视频，再选择返回的画质或音频选项。',
            '启动保存，等待浏览器下载完成。如果浏览器打开了预览页，使用该页或浏览器提供的保存操作。',
            '在下载记录中打开文件，确认画面、声音和时长符合预期。预览成功不代表文件已经保存。',
        ],
        featuresTitle: '不同链接对应不同任务',
        features: [
            'watch?v={videoId} 和 youtu.be/{videoId}：定位单个视频。',
            'shorts/{videoId}：定位一条 Shorts，不会自动展开创作者的其他作品。',
            'playlist?list={playlistId}：处理公开播放列表，展开后选择需要的条目。',
            'watch 地址同时带 v 和 list 时包含视频及列表信息；只保存单个视频时可使用不带 list 的视频地址。',
            '频道主页、搜索结果和需要登录的私人列表不能代替公开的视频或播放列表链接。',
        ],
        faqTitle: '按失败阶段排查',
        faqs: [
            { q: '粘贴后没有识别出视频怎么办？', a: '先在浏览器中打开原链接，确认具体视频仍可公开播放。重新复制视频分享地址，去除无关文字；私人、会员或受限制的视频可能无法处理。若公开链接仍报错，保留错误提示后再重试。' },
            { q: '为什么没有想要的 MP4 画质或 MP3？', a: '选项取决于源视频和解析结果，不是每个视频都有所有画质或音频格式。请选择实际返回的格式；修改文件扩展名不会进行转码。' },
            { q: '为什么能预览，却没有保存到手机相册？', a: '浏览器下载通常先进入文件或下载目录，不一定自动进入相册。先检查下载记录和文件大小，再使用系统支持的分享或保存到相册操作。' },
            { q: '列表中一项失败，需要全部重新下载吗？', a: '先检查失败条目是否仍公开可用。队列支持对失败项单独重试；已成功保存的文件不必重新下载。' },
        ],
        sections: [
            { title: '在电脑、Android 和 iPhone 上找文件', paragraphs: ['电脑：先查看浏览器下载记录，再打开下载目标文件夹。若选择了指定文件夹保存，请到该文件夹检查；仅看到任务加入队列还不代表下载完成。', 'Android：检查浏览器的下载记录以及系统文件管理器中的下载目录。视频没有出现在图库时，先尝试从文件管理器打开。', 'iPhone / iPad：在 Safari 下载记录或“文件”App 中检查实际下载位置。能够播放的兼容视频可尝试通过分享菜单保存到照片；可用操作取决于文件格式和系统。'] },
            { title: '区分解析失败和保存失败', paragraphs: ['解析失败：页面尚未返回可用视频或音频。重点检查链接类型、公开访问状态和错误提示。此时更改浏览器下载文件夹通常无助于解决。', '保存失败：已经有可用结果，但文件没有完整落盘。检查下载记录中的失败原因、网络连接、设备空间及浏览器权限，再重试对应条目。', '文件已保存但无法播放：检查是否下载完成以及播放器是否支持该格式。先尝试其他兼容播放器或选择另一可用格式，不要把改后缀当作格式转换。'] },
        ],
    };
    return {
        metaTitle: shorts ? 'How to Download YouTube Shorts: Links, Mobile Saving and Errors' : 'How to Download YouTube Videos: Links, Mobile Saving and Errors',
        metaDescription: 'Choose the right YouTube video, Shorts or playlist URL, find saved files on desktop, Android and iPhone, and troubleshoot extraction, format and saving errors.',
        lede: shorts ? 'A Shorts page identifies one short video, not a playlist. Follow the share link through to a saved file, then check the audio and find the download on your device.' : 'When a download does not finish, first identify whether the problem is link extraction, format selection or file saving. This guide explains what to check at each stage.',
        stepsTitle: shorts ? 'Save one Short from its share link' : 'From a video link to a local file',
        steps: [
            shorts ? 'Open the specific Short and copy its share link, such as youtube.com/shorts/ followed by the video ID.' : 'Open the specific video and copy its youtube.com/watch?v= URL or youtu.be share link.',
            'Open the matching downloader and paste the URL. Confirm that the detected content is the video you want, then select an available quality or audio option.',
            'Start saving and wait for the browser download to finish. If a preview opens, use the saving controls offered by that page or browser.',
            'Open the file from your download history and check its picture, sound and duration. A working preview does not mean a file has been saved.',
        ],
        featuresTitle: 'Match the URL to the task',
        features: [
            'watch?v={videoId} and youtu.be/{videoId} identify one video.',
            'shorts/{videoId} identifies one Short; it does not expand all posts from a creator.',
            'playlist?list={playlistId} identifies a public playlist whose entries can be selected after expansion.',
            'A watch URL containing both v and list carries video and playlist information. Use a video URL without list when you only want that video.',
            'Channel homepages, search results and private lists requiring sign-in are not substitutes for public video or playlist links.',
        ],
        faqTitle: 'Troubleshoot by failure stage',
        faqs: [
            { q: 'What should I check when a link is not detected?', a: 'Open the source URL and confirm that the specific video still plays publicly. Copy its share URL again without surrounding text. Private, members-only or restricted videos may not be available. Keep the error message if a public link still fails.' },
            { q: 'Why is my preferred MP4 quality or MP3 missing?', a: 'Available options depend on the source video and extraction result. Not every video offers every quality or audio format. Choose an option actually returned; changing a filename extension does not convert the media.' },
            { q: 'Why does the preview work but the video is missing from my gallery?', a: 'Browser downloads often go to a files or downloads folder instead of the photo library. Check download history and file size first, then use the save or share actions supported by your system.' },
            { q: 'Do I have to restart a playlist if one item fails?', a: 'First check whether that item is still publicly available. Failed queue items can be retried separately; files already saved do not need to be downloaded again.' },
        ],
        sections: [
            { title: 'Find the file on desktop, Android or iPhone', paragraphs: ['Desktop: open browser download history and then the destination folder. If you selected a folder for auto-save, check that folder. A task entering the queue is not a completed download.', 'Android: check browser download history and the Downloads location in the file manager. If the video is missing from the gallery, try opening it from the file manager first.', 'iPhone and iPad: check Safari download history or the Files app for the actual destination. For a compatible video, the share menu may offer saving to Photos. Available actions depend on the file format and system.'] },
            { title: 'Separate extraction errors from saving errors', paragraphs: ['Extraction error: no usable video or audio result has been returned. Check the URL type, public access and error message. Changing the browser download folder usually cannot fix this stage.', 'Saving error: a result exists, but the file has not finished saving. Check the failure reason in download history, your connection, storage space and browser permissions before retrying that item.', 'Saved file will not play: confirm the download is complete and the player supports the format. Try a compatible player or another available format instead of renaming the extension.'] },
        ],
    };
}
