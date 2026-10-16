import type { SeoLandingPage } from './landing-pages';

export const googleDriveLanding: SeoLandingPage = {
    slug: 'google-drive-video-downloader',
    locales: {
        en: {
            metaTitle: 'Google Drive Video Downloader - Save to MP4 | FreeSaveVideo',
            metaDescription: 'Download publicly shared Google Drive videos to MP4 online. Paste a video link, choose an available quality, and save video with audio for offline viewing.',
            metaKeywords: ['google drive video downloader', 'download google drive video', 'google drive to mp4', 'save google drive video'],
            h1: 'Google Drive Video Downloader',
            lede: 'Paste a publicly shared Google Drive video link to save an MP4 copy with audio. Keep lectures, meeting recordings, and your own shared videos available offline.',
            heroTags: ['Google Drive to MP4', 'Video with audio', 'Available quality options', 'Works in your browser'],
            facts: [
                'Use a link to one video that opens without signing in to Google. Keep any sharing parameters in the link.',
                'Sign-in and download credits may be required on FreeSaveVideo. Review any confirmation before creating a download task.',
            ],
            stepsTitle: 'How to download a Google Drive video',
            steps: [
                'Open the video in Google Drive and copy its full sharing link. Check that you have permission to save it and that the link is publicly accessible.',
                'Paste the video link into the box above and select Download Google Drive video. Sign in to FreeSaveVideo and review any credit confirmation if prompted.',
                'Choose an available quality in the download settings. Keep the tab open while the video and audio are prepared and saved.',
            ],
            featuresTitle: 'Save a Google Drive video as MP4',
            features: [
                'Start from a Google Drive video sharing link, without manually finding media URLs.',
                'Save supported video with its audio for offline viewing.',
                'Use the available playback versions; quality depends on the video Google Drive provides.',
                'Start the download in your browser without installing a separate downloader app.',
            ],
            sections: [
                {
                    title: 'Google Drive to MP4: playback copy or original file?',
                    paragraphs: [
                        'This downloader uses the playable media versions available from Google Drive. Some videos provide picture and sound separately, which need to be combined before saving.',
                        'A saved MP4 may differ from the original uploaded file in format, resolution, or size. If you need the exact original file and Google Drive offers its Download action, use that option.',
                    ],
                },
                {
                    title: 'Why a Google Drive video may not download',
                    paragraphs: [
                        'First check the sharing link in a signed-out browser window. A video that requires a Google account or organization membership is outside this page\'s supported public-link flow.',
                        'A removed video, unfinished video processing, expired media access, or a temporary Google limit can prevent downloading. Check that the video plays, copy the sharing link again, and try later if Google reports a limit.',
                        'Keep the download tab open while separate tracks are prepared. Do not paste your Google password or browser cookies into the link field.',
                    ],
                },
            ],
            supportedLinksTitle: 'Supported Google Drive links',
            supportedLinks: [
                { title: 'Individual video links', description: 'Use https://drive.google.com/file/d/FILE_ID/view for a publicly accessible video. Preserve sharing parameters such as resourcekey when present.' },
                { title: 'Videos rather than folders or documents', description: 'This page handles individual videos. It does not export folders, Google Docs, Sheets, or an entire Drive account.' },
                { title: 'Public access is required', description: 'This flow does not sign in to your Google account or promise access to private files or videos whose owner has restricted downloading.' },
            ],
            faqTitle: 'Google Drive video download FAQ',
            faqs: [
                { q: 'How do I download a Google Drive video from a link?', a: 'Copy the full sharing link to a publicly accessible video, paste it above, and start the download. Follow any FreeSaveVideo sign-in or credit confirmation, then keep the tab open until the file is saved.' },
                { q: 'Can I convert a Google Drive video to MP4?', a: 'Supported playable videos can be saved as an MP4 copy with audio. This does not guarantee the exact original upload or a higher resolution than Google Drive makes available.' },
                { q: 'Can I download Google Drive videos in HD or 1080p?', a: 'Choose your preferred quality in the download settings. HD or 1080p is available only when the source provides a compatible version; selecting a quality does not upscale the video.' },
                { q: 'Can I download a private or view-only Google Drive video?', a: 'This page supports publicly accessible video links. It does not authenticate as your Google account or guarantee downloading when the owner has disabled downloads. Ask the owner for an authorized downloadable copy if needed.' },
                { q: 'Why is the Google Drive download failing?', a: 'Check public sharing, confirm the video still plays, and copy its sharing link again. Video processing, temporary limits, and expired media URLs can interrupt downloads. A link requiring Google sign-in is not supported by this public-link flow.' },
                { q: 'Does downloading require an account or credits?', a: 'FreeSaveVideo may require sign-in and download credits. The existing download flow presents applicable confirmation before a task starts. You do not need to give this page your Google password.' },
                { q: 'Can I download an entire Google Drive folder?', a: 'No. Paste a link to one video at a time. Folder exports and downloads of documents or other non-video files are not supported on this page.' },
            ],
            disclaimer: 'Save only videos you own or have permission to download. FreeSaveVideo is not affiliated with Google or Google Drive.',
        },
    },
};
