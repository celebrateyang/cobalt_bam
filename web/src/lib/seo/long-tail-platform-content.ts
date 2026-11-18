import type { SeoLandingLocaleContent } from './landing-pages';
import { getDownloadEvidence } from './download-evidence';

const loomEvidence = getDownloadEvidence('loom')!;
const tumblrEvidence = getDownloadEvidence('tumblr')!;

const common = {
    faqTitle: 'Questions before you save',
    disclaimer: 'Save only public content you own or have permission to download. FreeSaveVideo is independent of the source platform. Private, deleted and DRM-protected media cannot be recovered here.',
};

const loom: SeoLandingLocaleContent = {
    ...common,
    quickAnswer: 'To save an authorized public Loom recording as MP4, copy its share or embed link, paste it into this form, and save the ready result. FreeSaveVideo is useful for one accessible recording you want to watch offline. For a recording you control, Loom\'s own export is another option. This page does not export a whole workspace or retrieve private recordings.',
    reviewedAt: '2026-11-11',
    metaTitle: 'Loom Video Downloader - Save a Public Loom to MP4 | FreeSaveVideo',
    metaDescription: 'Save an accessible public Loom recording as MP4 from its share or embed link. Find help for missing download buttons, offline viewing and saving on your phone.',
    metaKeywords: ['loom video downloader', 'loom to mp4', 'download loom video without download button', 'save loom video on iphone'],
    h1: 'Loom Video Downloader',
    lede: 'Keep a walkthrough, lesson or handover recording as an MP4 for offline viewing. Paste the public Loom share or embed link for a video you own or have permission to save.',
    heroTags: ['Share and embed links', 'MP4 for offline viewing', 'Works in your browser'],
    supportedLinksTitle: 'Copy the link to one Loom recording',
    supportedLinks: [
        { title: 'The share link', description: 'Open the recording and copy its loom.com/share/ address. A title before the 32-character video ID is accepted too. Workspace and library addresses do not identify one recording.' },
        { title: 'An embedded recording', description: 'If you already have a loom.com/embed/ link, paste that video address. Paste the URL itself rather than the full iframe HTML.' },
    ],
    stepsTitle: 'Download a Loom recording as MP4',
    steps: [
        'Open the recording, confirm you have permission to save it, and copy its public share or embed link.',
        'Paste the link above and prepare the download. The recording must expose an accessible MP4; being able to watch it inside your workspace is not enough.',
        'Save the ready result, then play the local MP4 to check the recording and its sound. Keep the page open until saving finishes.',
    ],
    featuresTitle: 'A recording you can open offline',
    features: ['Save an accessible public Loom recording as MP4.', 'Use a share or embed URL without installing a desktop downloader.', 'Keep the available recording and source sound; no resolution upscaling or missing-audio reconstruction.'],
    sections: [
        {
            title: 'When is FreeSaveVideo a good fit for Loom?',
            paragraphs: ['Use it when you have permission to save a public walkthrough, lesson or handover and want a browser-based MP4 workflow. The page accepts both share and embed links, including title-prefixed share links.', 'Choose Loom\'s native export when it is available for your recording. For private workspace content or a library migration, ask the owner or use the source platform\'s export tools. A public-link downloader is not a workspace backup service.'],
        },
        {
            title: 'Loom has no download button: where to start',
            paragraphs: [
                'Loom provides its own download option when your plan, role and video settings allow it. For a video you control, check that option first. If a shared recording has no download button, ask the creator for permission or an exported MP4.',
                'For an authorized public recording, this form tries the media exposed by its share link. A missing button does not establish that the video is publicly downloadable. Workspace-only, password-protected and unavailable recordings are outside this workflow.',
            ],
        },
        {
            title: 'Save a Loom video on iPhone, Android or a computer',
            paragraphs: [
                'Use the form in your phone or computer browser, then save the completed result. On iPhone, check the browser downloads and Files app. On Android, check Downloads. A saved file may not appear in your photo library automatically.',
                'An MP4 keeps the video, rather than the interactive Loom page. Comments, reactions and clickable page controls are not part of the file. This page does not promise a full workspace export or a separate transcript download.',
            ],
        },
        { title: 'What we checked', paragraphs: [loomEvidence.summary, loomEvidence.scope] },
        { title: 'How this download handles your link', paragraphs: ['The online downloader sends the link you submit to FreeSaveVideo to resolve and deliver the available media. Media can pass through temporary server processing; this is different from converting a local file entirely on your device.', 'Request metadata may appear in operational or security logs. Avoid submitting confidential links. The privacy policy and support contact below explain how to raise a question about your data or a failed download.'] },
    ],
    sources: [
        { title: 'Loom: download your video', href: 'https://support.atlassian.com/loom/docs/download-your-loom-video', note: 'Official guidance for native MP4 export. Reviewed November 11, 2026; source export controls may change.' },
        { title: 'Public Loom sample used for our check', href: loomEvidence.sourceUrl, note: 'One complete source-file check; see the scope above. This is not an independent review or a success-rate measurement.' },
        { title: 'FreeSaveVideo privacy policy', href: '/en/about/privacy', note: 'Information processed for online downloads, temporary media handling and operational logs.' },
        { title: 'Contact FreeSaveVideo support', href: '/en/support', note: 'Ask about a failed source link or data handling.' },
    ],
    faqs: [
        { q: 'How do I convert a Loom link to MP4?', a: 'Paste a public loom.com/share/ or loom.com/embed/ link above. If the recording exposes accessible MP4 media, prepare and save the result. There is no need to upload a local file.' },
        { q: 'Can I download a Loom video without its download button?', a: 'For a recording you own or are allowed to save, try its public share link. Success depends on accessible source media. If the video requires workspace access or a password, ask the owner for an export; this form does not access restricted recordings.' },
        { q: 'Can I save a private or password-protected Loom?', a: 'No. A recording available only inside a restricted workspace is not public. Request an authorized MP4 from the recording owner instead.' },
        { q: 'Why does my public Loom link fail?', a: 'The recording may have been removed, restricted or still be processing. Reopen the source and copy its video link again. Share and embed URLs, including title-prefixed links ending in a 32-character video ID, are accepted.' },
        { q: 'Will the MP4 include Loom comments and chapters?', a: 'The output is the accessible video recording. Interactive comments, reactions and page controls are not exported. Do not assume that a successful video download also includes a transcript or chapters.' },
    ],
};

const tumblr: SeoLandingLocaleContent = {
    ...common,
    quickAnswer: 'To save a native Tumblr video with its available sound, copy the individual public post link, paste it into this form, and save the prepared MP4. An accessible reblog trail can also expose the original native video. If the post embeds YouTube or Vimeo, open that source instead. Photo galleries, GIF collections and whole-blog exports are outside this page.',
    reviewedAt: '2026-11-11',
    metaTitle: 'Tumblr Video Downloader - Save a Post as MP4 | FreeSaveVideo',
    metaDescription: 'Download an available native Tumblr video from a public post as MP4. Supports blog and tumblr.com post links, with help for reblogs, embeds and phone saving.',
    metaKeywords: ['tumblr video downloader', 'tumblr to mp4', 'download tumblr video with sound', 'save tumblr video on iphone', 'download reblogged tumblr video'],
    h1: 'Tumblr Video Downloader',
    lede: 'Save an available video uploaded to Tumblr as an MP4 with its source sound. Paste one public post link, including an original post or a reblog that exposes the native video.',
    heroTags: ['Public post links', 'Native Tumblr video', 'MP4 with source sound'],
    supportedLinksTitle: 'Use the post, not the dashboard',
    supportedLinks: [
        { title: 'A tumblr.com post', description: 'Copy the specific post address with its blog name and numeric post ID. Keep a trailing post title or share parameters if present.' },
        { title: 'A blog post address', description: 'The older BLOG.tumblr.com/post/POST_ID format identifies the same kind of individual post. A blog homepage is not a video link.' },
        { title: 'A blog-view post link', description: 'A tumblr.com/blog/view/BLOG/POST_ID URL also identifies a post. Dashboard, tag, search and feed addresses do not.' },
    ],
    stepsTitle: 'Save a Tumblr video with sound',
    steps: [
        'Open the public post containing the video, use its share menu and copy the complete post link.',
        'Paste the link above. The downloader looks for accessible native Tumblr media, including media exposed in the reblog trail.',
        'Save the prepared result and open the MP4. Check the picture and source sound before closing the tab; use your browser downloads to find the file.',
    ],
    featuresTitle: 'The post determines the output',
    features: ['A native Tumblr video can return an MP4 with its available sound.', 'A reblog can work when its accessible trail exposes native Tumblr video.', 'Native audio posts can return an audio file; photos and external embeds are different media types.'],
    sections: [
        { title: 'When is FreeSaveVideo a good fit for Tumblr?', paragraphs: ['Use it for one public Tumblr post containing a native video you are permitted to save. It accepts current tumblr.com post links and older blog-subdomain post links, keeping the available source sound.', 'Use the original host for an external video embed. If you need a complete archive of your own blog, use Tumblr\'s account export tools instead of treating a single-post downloader as a backup service.'] },
        {
            title: 'A reblogged video and an external embed are different',
            paragraphs: [
                'A reblog may include native video in its original post trail. The downloader checks accessible content in that trail, but it does not archive an entire conversation or return every video on a blog.',
                'A YouTube or Vimeo player embedded in a Tumblr post is hosted by another platform. Open that original video and use its platform downloader instead. A play icon or animated preview does not prove that the post contains a native Tumblr MP4.',
            ],
        },
        {
            title: 'Tumblr video downloads on iPhone and Android',
            paragraphs: [
                'Prepare the post in your browser and save the finished file. Look in browser downloads or Files on iPhone, and Downloads on Android. Moving an MP4 into Photos or a gallery is a separate device action.',
                'If the result has no sound, first check whether the source video actually includes audio. This workflow preserves available source sound; it cannot recreate missing sound. Native audio posts return audio rather than a video made from their cover image.',
            ],
        },
        { title: 'What we checked', paragraphs: [tumblrEvidence.summary, tumblrEvidence.scope] },
        { title: 'How this download handles your link', paragraphs: ['The submitted post URL is sent to FreeSaveVideo to resolve the accessible media. A download may pass temporarily through server processing. This is an online media workflow, rather than an entirely local conversion.', 'Operational or security logs may include request metadata. Avoid submitting confidential links. Read the privacy policy below for data handling and contact support if a post returns the wrong media or cannot be processed.'] },
    ],
    sources: [
        { title: 'Tumblr: export your own blog', href: 'https://help.tumblr.com/knowledge-base/export-your-blog/', note: 'Official blog-backup workflow, a different task from saving one native video. Reviewed November 11, 2026.' },
        { title: 'Public Tumblr sample used for our check', href: tumblrEvidence.sourceUrl, note: 'One complete source-file check; see the scope above. It does not establish a success rate for all posts or reblogs.' },
        { title: 'FreeSaveVideo privacy policy', href: '/en/about/privacy', note: 'Information processed for online downloads, temporary media handling and operational logs.' },
        { title: 'Contact FreeSaveVideo support', href: '/en/support', note: 'Report a failed post link or ask about data handling.' },
    ],
    faqs: [
        { q: 'How do I download a Tumblr video as MP4?', a: 'Copy the individual public post link and paste it above. A native Tumblr video with accessible media can be prepared as MP4. Save and check the completed file.' },
        { q: 'Can I download a reblogged Tumblr video?', a: 'A reblog can work if its accessible post trail includes a native Tumblr video. Removed originals, inaccessible posts and externally hosted video can prevent a result.' },
        { q: 'Does the download include sound?', a: 'An available native video keeps its source sound. A silent source remains silent. If you received an audio file, the accessible post may contain native audio rather than a native video.' },
        { q: 'Can I download Tumblr GIFs, photosets or a whole blog?', a: 'This form is for native video and audio in one public post. It does not offer photo or GIF galleries, whole-blog archives or a bulk export of reblogs.' },
        { q: 'Why does an embedded video fail?', a: 'The player may belong to YouTube, Vimeo or another external host. Open the original source video and use that platform page. Private, restricted and removed Tumblr content is not supported here.' },
    ],
};

export const longTailPlatformContent = { loom: { en: loom }, tumblr: { en: tumblr } };
