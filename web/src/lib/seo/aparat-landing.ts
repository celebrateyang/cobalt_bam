import type { SeoLandingPage } from './landing-pages';

export const aparatUpdatedAt = '2026-10-25';
export const aparatSlug = 'aparat-video-downloader';

export const aparatUi = {
    en: {
        eyebrow: 'APARAT VIDEO DOWNLOADER', language: 'Page language', home: 'All download tools',
        jump: 'Download a video', label: 'Aparat video, Shorts or playlist link', button: 'Prepare download',
        placeholder: 'https://www.aparat.com/v/...', busy: 'Checking your link...',
        hint: 'Public links only. FreeSaveVideo sign-in and credits may be required; review any confirmation before downloading.',
        interfaceNote: '', invalid: 'Paste a public aparat.com/v/..., /shorts/... or /playlist/... link.',
        failure: 'Could not prepare this link. Check that it still opens on Aparat, then try again.',
        ready: 'Your download is prepared. Follow the download dialog or queue to save the file.',
        playlistReady: 'Your playlist is ready. Select the videos you want in the download dialog.',
        summary: 'What this downloader supports', evidence: 'What we checked', reviewed: 'Last reviewed: 25 October 2026',
        evidenceBody: 'A public Shorts sample saved as a complete 720 × 1280 MP4 with sound and passed a full audio/video decode. A public playlist expanded to 97 entries; its first, middle and last video were checked for MP4 availability. These sample checks do not guarantee every link or quality.',
        sampleVideo: 'View the Shorts sample on Aparat', samplePlaylist: 'View the playlist sample on Aparat',
        result: 'Download result', source: 'Available MP4 from Aparat', quality: 'Quality', qualityValue: 'Source-dependent; no upscaling',
        access: 'Access', accessValue: 'Public, downloadable content', cost: 'Account and credits', costValue: 'Follow the confirmation shown before download',
        footer: 'Independent downloader. Not affiliated with Aparat.', privacy: 'Privacy', terms: 'Terms', back: 'Back to download',
    },
    fa: {
        eyebrow: 'دانلود ویدیو از آپارات', language: 'زبان صفحه', home: 'همه ابزارهای دانلود',
        jump: 'دانلود ویدیو', label: 'لینک ویدیو، شورت یا لیست پخش آپارات', button: 'آماده‌سازی دانلود',
        placeholder: 'https://www.aparat.com/v/...', busy: 'در حال بررسی لینک...',
        hint: 'فقط لینک‌های عمومی پشتیبانی می‌شوند. ممکن است ورود به FreeSaveVideo و اعتبار دانلود لازم باشد؛ پیش از شروع، تأییدیه را بررسی کنید.',
        interfaceNote: 'این صفحه و فرم به فارسی هستند؛ پنجره‌های حساب کاربری و مدیریت دانلود فعلاً به انگلیسی نمایش داده می‌شوند.',
        invalid: 'یک لینک عمومی آپارات با مسیر /v/، /shorts/ یا /playlist/ وارد کنید.',
        failure: 'آماده‌سازی این لینک ممکن نشد. ابتدا مطمئن شوید هنوز در آپارات باز می‌شود و دوباره تلاش کنید.',
        ready: 'درخواست آماده شد. برای ذخیره فایل، پنجره دانلود یا صف دانلود را دنبال کنید.',
        playlistReady: 'لیست پخش آماده است. در پنجره دانلود، ویدیوهای دلخواه را انتخاب کنید.',
        summary: 'این ابزار چه چیزهایی را پشتیبانی می‌کند؟', evidence: 'چه مواردی را بررسی کرده‌ایم؟', reviewed: 'آخرین بررسی: ۲۵ اکتبر ۲۰۲۶',
        evidenceBody: 'یک نمونه شورت عمومی به‌صورت فایل کامل MP4 با ابعاد ۷۲۰ × ۱۲۸۰ و صدا ذخیره شد و بررسی کامل تصویر و صدا را گذراند. یک لیست پخش عمومی به ۹۷ مورد گسترش یافت و دسترسی به فایل MP4 برای ویدیوی اول، میانی و آخر بررسی شد. این آزمون‌های نمونه، موفقیت همه لینک‌ها یا کیفیت‌ها را تضمین نمی‌کنند.',
        sampleVideo: 'مشاهده نمونه شورت در آپارات', samplePlaylist: 'مشاهده نمونه لیست پخش در آپارات',
        result: 'فایل خروجی', source: 'نسخه MP4 موجود در آپارات', quality: 'کیفیت', qualityValue: 'وابسته به منبع؛ بدون افزایش مصنوعی وضوح',
        access: 'دسترسی', accessValue: 'محتوای عمومی و قابل دانلود', cost: 'حساب کاربری و اعتبار', costValue: 'طبق تأییدیه‌ای که پیش از دانلود نمایش داده می‌شود',
        footer: 'ابزاری مستقل برای دانلود؛ وابسته به آپارات نیست.', privacy: 'حریم خصوصی', terms: 'شرایط استفاده', back: 'بازگشت به دانلود',
    },
};

export const aparatLanding: SeoLandingPage = {
    slug: aparatSlug,
    supportedLinkFormats: ['https://www.aparat.com/v/VIDEO_ID', 'https://www.aparat.com/shorts/SHORT_ID', 'https://www.aparat.com/playlist/PLAYLIST_ID'],
    locales: {
        en: {
            metaTitle: 'Aparat Video Downloader: MP4, Shorts & Playlists | FreeSaveVideo',
            metaDescription: 'Save public Aparat videos and Shorts as MP4 with sound. Expand a playlist, choose videos, and download directly from Aparat. English and Persian guide.',
            metaKeywords: ['aparat video downloader', 'download aparat video', 'aparat shorts downloader', 'aparat playlist download', 'aparat to mp4'],
            h1: 'Download Aparat videos, Shorts and playlists',
            lede: 'Save a public Aparat video as an MP4 with its sound, or open a playlist and choose the videos you want. FreeSaveVideo finds an available file on Aparat and lets your browser download it directly.',
            heroTags: ['MP4 with sound', 'Shorts supported', 'Choose playlist videos', 'English / فارسی'],
            facts: ['Use the original Aparat page link, not an expired media URL.', 'Available quality depends on Aparat. No source login password is needed.'],
            stepsTitle: 'How to download an Aparat video',
            steps: [
                'Open the public video, Shorts page or playlist in Aparat and copy its full page link.',
                'Paste the link above and select Prepare download. For a playlist, select the entries you want. Review any FreeSaveVideo sign-in or credit confirmation.',
                'Keep the tab open while your browser saves the MP4. If direct fetching is blocked, follow the extension or browser download option shown.',
            ],
            featuresTitle: 'One place for videos, Shorts and playlists',
            features: [
                'Save compatible MP4 video with sound without installing a separate downloader app for the normal browser flow.',
                'Use Aparat Shorts links as well as ordinary video links.',
                'Expand public playlists of up to 500 entries and select individual videos before starting the batch queue; account limits may be lower.',
                'Download the available source file directly from Aparat CDN. FreeSaveVideo does not add a watermark or upscale the video.',
            ],
            supportedLinksTitle: 'Supported Aparat links',
            supportedLinks: [
                { title: 'Public videos', description: 'aparat.com/v/VIDEO_ID — one publicly accessible video with an available downloadable MP4.' },
                { title: 'Aparat Shorts', description: 'aparat.com/shorts/SHORT_ID — public short videos whose media is available as a compatible MP4.' },
                { title: 'Public playlists', description: 'aparat.com/playlist/PLAYLIST_ID — read the list, choose entries and download each video as its own file.' },
            ],
            sections: [
                { title: 'Why use FreeSaveVideo for Aparat?', paragraphs: [
                    'You can use the page link you already have, whether it points to a normal video, a Short or a playlist. There is no need to locate a signed media URL yourself. A playlist becomes a list of selectable videos rather than one oversized download.',
                    'For public teaching videos, your own uploads and other videos you have permission to save, MP4 with sound is a practical format for offline viewing. The browser downloads from Aparat; the ordinary video flow does not re-encode the file.',
                ] },
                { title: 'Playlist downloads: select first, then save', paragraphs: [
                    'Paste a public playlist link to see its available entries. Keep only the videos you need and start the queue. Each entry keeps its own title and page link and is saved separately; this is not a ZIP export or a merged playlist video.',
                    'The parser supports lists of up to 500 entries. Your account or batch allowance can be lower. Deleted, private or otherwise unavailable videos can fail individually. Retry a failed entry from its page link so a fresh media address can be obtained.',
                ] },
                { title: 'Quality, access and failed downloads', paragraphs: [
                    'Choose a preferred quality in the download settings. The result depends on the compatible file Aparat currently offers. A 1080p preference cannot turn a 720p source into Full HD, and the downloaded playback copy is not guaranteed to be the original upload.',
                    'If a download fails, check that the page still plays publicly in Aparat and paste the page link again. Temporary source limits, expired links, network restrictions and browser rules can interrupt saving. An extension or browser handoff may be offered; this flow does not fall back to relaying the video through our server.',
                    'Private, paid, deleted, DRM-protected and download-disabled content is outside this public-link flow. FreeSaveVideo may require its own sign-in and download credits; it does not need your Aparat password or cookies.',
                ] },
            ],
            faqTitle: 'Aparat download questions',
            faqs: [
                { q: 'How can I download an Aparat video as MP4?', a: 'Copy a public aparat.com/v/ link, paste it above and select Prepare download. Follow any account or credit confirmation, then save the available MP4 with sound through the download dialog.' },
                { q: 'Can I download Aparat Shorts?', a: 'Yes. Public aparat.com/shorts/ links are supported when a compatible MP4 is available. Paste the Shorts page link into the same box; you do not need to convert it to a normal video link.' },
                { q: 'Can I download an Aparat playlist?', a: 'Yes. Paste a public aparat.com/playlist/ link, select the entries you want and start the batch queue. Each video is saved separately. The parser supports up to 500 entries; account and batch limits also apply.' },
                { q: 'Does it preserve sound and HD quality?', a: 'Supported MP4 videos include the source audio. Quality depends on the source file available from Aparat. HD and 1080p are available only when a compatible rendition exists; no upscaling is performed.' },
                { q: 'Does FreeSaveVideo remove the Aparat watermark?', a: 'FreeSaveVideo does not add a watermark. It does not promise to remove a logo, watermark or text already present in the source video.' },
                { q: 'Is the Aparat downloader free or do I need an account?', a: 'FreeSaveVideo may require sign-in and download credits or a membership allowance. Review the applicable confirmation before starting. You do not need to provide an Aparat password.' },
                { q: 'Can I use it on a phone?', a: 'You can open this page in a mobile browser. Saving depends on your browser, device storage and the source file. If direct saving is blocked, use the offered browser option; extension support depends on your browser.' },
                { q: 'Why did my Aparat link stop working?', a: 'The video may be unavailable or a temporary media address may have expired. Confirm that the video is public and plays on Aparat, then paste its page link again. Source limits and network restrictions can also prevent a download.' },
            ],
            disclaimer: 'Download only content you own or have permission to save. FreeSaveVideo is independent of Aparat and does not bypass access controls.',
        },
        fa: {
            metaTitle: 'دانلود از آپارات؛ ویدیو، شورت و لیست پخش | FreeSaveVideo',
            metaDescription: 'دانلود ویدیو و شورت عمومی آپارات به‌صورت MP4 با صدا. لینک لیست پخش را وارد کنید، ویدیوها را انتخاب کنید و مستقیم از آپارات ذخیره کنید. راهنمای فارسی.',
            metaKeywords: ['دانلود از آپارات', 'دانلود ویدیو از آپارات', 'دانلود شورت آپارات', 'دانلود لیست پخش آپارات', 'تبدیل آپارات به MP4'],
            h1: 'دانلود ویدیو، شورت و لیست پخش از آپارات',
            lede: 'ویدیوی عمومی آپارات را به‌صورت MP4 با صدا ذخیره کنید، یا لینک لیست پخش را وارد کنید و ویدیوهای دلخواه را انتخاب کنید. FreeSaveVideo فایل موجود در آپارات را پیدا می‌کند تا مرورگر شما آن را مستقیم دانلود کند.',
            heroTags: ['MP4 با صدا', 'پشتیبانی از شورت', 'انتخاب از لیست پخش', 'فارسی / English'],
            facts: ['لینک صفحه اصلی ویدیو در آپارات را وارد کنید، نه آدرس موقت فایل رسانه.', 'کیفیت به فایل موجود در آپارات بستگی دارد. نیازی به رمز عبور آپارات نیست.'],
            stepsTitle: 'چطور از آپارات ویدیو دانلود کنیم؟',
            steps: [
                'ویدیو، شورت یا لیست پخش عمومی را در آپارات باز کنید و لینک کامل صفحه را کپی کنید.',
                'لینک را در کادر بالا وارد کنید و «آماده‌سازی دانلود» را بزنید. برای لیست پخش، موارد دلخواه را انتخاب کنید. اگر ورود به FreeSaveVideo یا تأیید اعتبار درخواست شد، آن را بررسی کنید.',
                'تا پایان ذخیره فایل MP4، صفحه را باز نگه دارید. اگر دریافت مستقیم مسدود شد، گزینه افزونه یا دانلود با مرورگر را که نمایش داده می‌شود دنبال کنید.',
            ],
            featuresTitle: 'ویدیو، شورت و لیست پخش در یک ابزار',
            features: [
                'ذخیره فایل MP4 سازگار با صدا، بدون نیاز به نصب برنامه جداگانه در مسیر معمول دانلود با مرورگر.',
                'پشتیبانی از لینک شورت آپارات در کنار لینک ویدیوهای معمولی.',
                'گسترش لیست پخش عمومی تا ۵۰۰ مورد و انتخاب ویدیوها پیش از شروع صف دانلود؛ محدودیت حساب ممکن است کمتر باشد.',
                'دریافت فایل موجود مستقیم از شبکه توزیع محتوای آپارات. FreeSaveVideo واترمارک اضافه نمی‌کند و وضوح ویدیو را به‌صورت مصنوعی افزایش نمی‌دهد.',
            ],
            supportedLinksTitle: 'لینک‌های پشتیبانی‌شده آپارات',
            supportedLinks: [
                { title: 'ویدیوی عمومی', description: 'aparat.com/v/VIDEO_ID — یک ویدیوی عمومی با فایل MP4 قابل دانلود.' },
                { title: 'شورت آپارات', description: 'aparat.com/shorts/SHORT_ID — ویدیوی کوتاه عمومی که نسخه MP4 سازگار آن در دسترس باشد.' },
                { title: 'لیست پخش عمومی', description: 'aparat.com/playlist/PLAYLIST_ID — نمایش فهرست، انتخاب موارد و ذخیره هر ویدیو به‌صورت فایل جداگانه.' },
            ],
            sections: [
                { title: 'چرا برای دانلود از آپارات از FreeSaveVideo استفاده کنیم؟', paragraphs: [
                    'همان لینک صفحه‌ای را که دارید وارد کنید؛ فرقی نمی‌کند مربوط به ویدیوی معمولی، شورت یا لیست پخش باشد. لازم نیست خودتان آدرس موقت فایل را پیدا کنید. لیست پخش به فهرستی از ویدیوهای قابل انتخاب تبدیل می‌شود، نه یک دانلود حجیم و یکپارچه.',
                    'برای ویدیوهای آموزشی عمومی، آثار خودتان و محتوایی که اجازه ذخیره آن را دارید، MP4 با صدا قالب مناسبی برای تماشای آفلاین است. مرورگر فایل را از آپارات دریافت می‌کند و در مسیر معمول دانلود ویدیو، فایل دوباره کدگذاری نمی‌شود.',
                ] },
                { title: 'دانلود لیست پخش: اول انتخاب، بعد ذخیره', paragraphs: [
                    'لینک لیست پخش عمومی را وارد کنید تا موارد در دسترس نمایش داده شوند. ویدیوهای موردنیاز را انتخاب کنید و صف دانلود را شروع کنید. هر مورد عنوان و لینک صفحه خود را نگه می‌دارد و جداگانه ذخیره می‌شود؛ خروجی، فایل ZIP یا یک ویدیوی ادغام‌شده نیست.',
                    'تجزیه‌کننده از فهرست‌های حداکثر ۵۰۰ موردی پشتیبانی می‌کند. سهمیه حساب یا دانلود دسته‌ای شما ممکن است کمتر باشد. ویدیوهای حذف‌شده، خصوصی یا غیرقابل‌دسترس ممکن است جداگانه ناموفق شوند. برای تلاش مجدد، از لینک صفحه ویدیو استفاده کنید تا آدرس تازه فایل دریافت شود.',
                ] },
                { title: 'کیفیت، دسترسی و رفع مشکل دانلود', paragraphs: [
                    'کیفیت دلخواه را در تنظیمات دانلود انتخاب کنید. نتیجه به فایل سازگاری بستگی دارد که آپارات در همان زمان ارائه می‌کند. انتخاب 1080p یک منبع 720p را به Full HD تبدیل نمی‌کند و نسخه قابل پخش دانلودشده لزوماً همان فایل اصلی بارگذاری‌شده نیست.',
                    'اگر دانلود ناموفق بود، بررسی کنید که ویدیو هنوز به‌صورت عمومی در آپارات پخش می‌شود و لینک صفحه را دوباره وارد کنید. محدودیت موقت منبع، انقضای آدرس فایل، محدودیت شبکه یا قواعد مرورگر ممکن است مانع ذخیره شوند. در صورت نیاز، گزینه افزونه یا مرورگر ارائه می‌شود؛ این مسیر به انتقال فایل ویدیو از سرور ما برنمی‌گردد.',
                    'محتوای خصوصی، پولی، حذف‌شده، دارای DRM یا با دانلود غیرفعال، در این مسیر لینک عمومی پشتیبانی نمی‌شود. ممکن است ورود به FreeSaveVideo و اعتبار دانلود لازم باشد، اما رمز عبور یا کوکی آپارات شما درخواست نمی‌شود.',
                ] },
            ],
            faqTitle: 'پرسش‌های متداول دانلود از آپارات',
            faqs: [
                { q: 'چطور ویدیوی آپارات را به‌صورت MP4 دانلود کنم؟', a: 'لینک عمومی aparat.com/v/ را کپی کنید، در کادر بالا قرار دهید و «آماده‌سازی دانلود» را بزنید. اگر تأیید حساب یا اعتبار نمایش داده شد، آن را بررسی کنید و سپس فایل MP4 موجود با صدا را از پنجره دانلود ذخیره کنید.' },
                { q: 'آیا دانلود شورت آپارات پشتیبانی می‌شود؟', a: 'بله. لینک‌های عمومی aparat.com/shorts/ زمانی پشتیبانی می‌شوند که فایل MP4 سازگار در دسترس باشد. همان لینک صفحه شورت را وارد کنید؛ نیازی به تبدیل آن به لینک ویدیوی معمولی نیست.' },
                { q: 'می‌توانم لیست پخش آپارات را دانلود کنم؟', a: 'بله. لینک عمومی aparat.com/playlist/ را وارد کنید، موارد دلخواه را انتخاب کنید و صف دانلود دسته‌ای را شروع کنید. هر ویدیو جداگانه ذخیره می‌شود. سقف تجزیه فهرست ۵۰۰ مورد است و محدودیت حساب و دانلود دسته‌ای نیز اعمال می‌شود.' },
                { q: 'صدا و کیفیت HD حفظ می‌شود؟', a: 'فایل‌های MP4 پشتیبانی‌شده شامل صدای منبع هستند. کیفیت به فایل موجود در آپارات بستگی دارد. HD و 1080p فقط در صورت وجود نسخه سازگار در دسترس‌اند؛ وضوح به‌صورت مصنوعی افزایش داده نمی‌شود.' },
                { q: 'FreeSaveVideo واترمارک آپارات را حذف می‌کند؟', a: 'FreeSaveVideo واترمارک اضافه نمی‌کند. حذف لوگو، واترمارک یا نوشته‌ای که از قبل داخل ویدیوی منبع وجود دارد تضمین نمی‌شود.' },
                { q: 'دانلود از آپارات رایگان است یا حساب کاربری لازم دارد؟', a: 'ممکن است ورود به FreeSaveVideo و اعتبار دانلود یا سهمیه عضویت لازم باشد. پیش از شروع، تأییدیه مربوط را بررسی کنید. نیازی به ارائه رمز عبور آپارات ندارید.' },
                { q: 'با گوشی هم می‌توانم دانلود کنم؟', a: 'می‌توانید این صفحه را در مرورگر موبایل باز کنید. ذخیره فایل به مرورگر، فضای دستگاه و فایل منبع بستگی دارد. اگر ذخیره مستقیم مسدود شد، از گزینه مرورگر استفاده کنید؛ پشتیبانی از افزونه به مرورگر شما بستگی دارد.' },
                { q: 'چرا لینک آپارات دیگر کار نمی‌کند؟', a: 'ممکن است ویدیو از دسترس خارج شده یا آدرس موقت فایل منقضی شده باشد. عمومی بودن و پخش ویدیو در آپارات را بررسی کنید و لینک صفحه را دوباره وارد کنید. محدودیت منبع و شبکه هم می‌تواند باعث خطا شود.' },
            ],
            disclaimer: 'فقط محتوایی را دانلود کنید که مالک آن هستید یا اجازه ذخیره آن را دارید. FreeSaveVideo مستقل از آپارات است و کنترل‌های دسترسی را دور نمی‌زند.',
        },
    },
};
