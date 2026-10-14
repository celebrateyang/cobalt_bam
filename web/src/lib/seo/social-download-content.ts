import type { SeoLandingLocaleContent } from './landing-pages';

export type SocialPlatform = 'reddit' | 'pinterest';
type EditorialCopy = {
    h1: string;
    steps: [string, string, string];
    lede: string;
    featuresTitle: string;
    features: [string, string, string];
    facts: [string, string, string];
    faqs: Array<{ q: string; a: string }>;
};

// These are platform-specific explanations, not substitutions into a platform template.
// Translations describe the same actual feature set; they are not separate keyword pages.
export const redditEditorial: Record<string, EditorialCopy> = {
    en: {
        h1: 'Reddit Video Downloader with Sound',
        steps: ['Copy the original Reddit video post link from its Share menu.', 'Paste the post link in this form and start the download. Video mode keeps source audio when available.', 'Follow the task in the download queue. When saving finishes, play the file to check both picture and sound.'],
        lede: 'Save a video from a public Reddit post. FreeSaveVideo looks for the matching audio track and combines it with the video when available. A silent source stays silent.',
        featuresTitle: 'Where did the Reddit audio go?',
        features: ['A video track', 'A separate audio track', 'One playable download'],
        facts: ['Reddit-hosted video can deliver the picture and sound separately. Saving just the video resource can leave you with a silent file.', 'The downloader checks for an available matching audio track. A GIF, a silent upload, or an unavailable audio source cannot supply sound.', 'When both tracks are accessible, they are combined for saving. The download queue shows processing and saving progress; starting a task does not mean the file is already saved.'],
        faqs: [
            { q: 'Will every Reddit video download with sound?', a: 'Only if an accessible audio track exists. If the Reddit post plays silently, no downloader can recreate a missing soundtrack. If it plays with sound but your file is silent, retry the original post link and check the finished file.' },
            { q: 'Should I paste a post link or a v.redd.it resource?', a: 'Use the Reddit post link, including a supported Reddit share link. It supplies the post context used to find the media. This form does not accept raw CDN resources or subreddit feeds.' },
            { q: 'What about GIFs, external videos, and removed posts?', a: 'A native GIF may be saved as GIF and has no audio track. A post linking to another video platform is not a Reddit-hosted video; use that platform\'s downloader. Deleted or inaccessible media cannot be recovered here.' },
        ],
    },
    zh: {
        h1: 'Reddit 视频下载：有音轨时合并声音',
        steps: ['从 Reddit 视频原帖的分享菜单复制帖子链接。', '粘贴到本页表单并开始下载；视频模式会保留可用的原始音轨。', '在下载队列查看任务，保存完成后播放文件，检查画面与声音。'],
        lede: '粘贴公开 Reddit 视频帖子的链接。FreeSaveVideo 会查找匹配音轨，存在且可访问时与画面一起保存；原本静音的内容不会凭空产生声音。',
        featuresTitle: '为什么 Reddit 视频能播放，下载后却没声音？',
        features: ['画面可能单独传输', '检查匹配的声音轨道', '合并后再保存'],
        facts: ['Reddit 原生视频可能将画面和声音分开提供。只保存视频资源，就可能得到无声文件。', '下载器会检查可用的匹配音轨。GIF、静音投稿或无法访问的声音资源，都不能提供音频。', '两条轨道均可访问时，会合并用于保存。下载队列显示处理与保存进度；任务开始不代表文件已经保存成功。'],
        faqs: [
            { q: '所有 Reddit 视频都能下载成有声文件吗？', a: '只有存在且能访问音轨时才可以。原帖就是静音时，下载器无法补出原本不存在的声音。如果原帖有声而文件无声，请用原始帖子链接重试，并检查最终保存的文件。' },
            { q: '应该粘贴帖子链接还是 v.redd.it 地址？', a: '请使用 Reddit 帖子链接或支持的 Reddit 分享链接，以便获取帖子中的媒体信息。本表单不接收原始 CDN 资源链接或整个社区列表。' },
            { q: 'GIF、外链视频和已删除帖子怎么处理？', a: '原生 GIF 可能保存为 GIF，本身没有音轨。指向其他视频平台的帖子不属于 Reddit 原生视频，请使用对应平台的下载页。这里无法恢复已删除或不可访问的媒体。' },
        ],
    },
    de: {
        h1: 'Reddit-Videos mit Ton herunterladen',
        steps: ['Kopiere im Teilen-Menü den ursprünglichen Reddit-Videobeitrag.', 'Füge den Beitragslink hier ein und starte den Download. Verfügbarer Originalton bleibt erhalten.', 'Verfolge den Auftrag in der Warteschlange und prüfe Bild und Ton der gespeicherten Datei.'],
        lede: 'Füge den Link eines öffentlichen Reddit-Videobeitrags ein. Eine zugängliche Tonspur wird mit dem Video verbunden. Stumme Quellen bleiben stumm.',
        featuresTitle: 'Warum fehlt bei Reddit-Videos manchmal der Ton?',
        features: ['Die Videospur', 'Die separate Tonspur', 'Die gemeinsame Datei'],
        facts: ['Reddit kann Bild und Ton getrennt ausliefern. Wer nur die Videoressource speichert, erhält möglicherweise eine stumme Datei.', 'Der Downloader sucht nach einer passenden Tonspur. GIFs, stumme Uploads und nicht zugängliche Audioquellen liefern keinen Ton.', 'Sind beide Spuren zugänglich, werden sie zum Speichern verbunden. Den Verarbeitungs- und Speicherfortschritt zeigt die Warteschlange; ein gestarteter Auftrag ist noch keine gespeicherte Datei.'],
        faqs: [
            { q: 'Hat jedes heruntergeladene Reddit-Video Ton?', a: 'Nur wenn eine zugängliche Tonspur existiert. Fehlender Originalton lässt sich nicht wiederherstellen. Hat der Beitrag Ton, die Datei aber nicht, versuche den ursprünglichen Beitragslink erneut.' },
            { q: 'Beitragslink oder v.redd.it-Adresse?', a: 'Verwende einen Reddit-Beitragslink oder einen unterstützten Freigabelink. Rohe CDN-Adressen und Subreddit-Feeds werden in diesem Formular nicht angenommen.' },
            { q: 'Was gilt für GIFs und externe Videos?', a: 'Native GIFs können als GIF gespeichert werden und enthalten keinen Ton. Für extern verlinkte Videos nutze den Downloader der Quellplattform. Gelöschte oder unzugängliche Medien lassen sich hier nicht wiederherstellen.' },
        ],
    },
    es: {
        h1: 'Descargar videos de Reddit con sonido',
        steps: ['Copia el enlace original del video desde Compartir en Reddit.', 'Pégalo en este formulario e inicia la descarga. Se conserva el audio original disponible.', 'Sigue la tarea en la cola y comprueba la imagen y el sonido del archivo guardado.'],
        lede: 'Pega el enlace de una publicación pública de Reddit. Si hay una pista de audio accesible, se combina con el video. Un original silencioso seguirá sin sonido.',
        featuresTitle: '¿Por qué desaparece el sonido de Reddit?',
        features: ['La pista de video', 'El audio por separado', 'Un archivo para guardar'],
        facts: ['Reddit puede servir la imagen y el sonido por separado. Guardar solo el recurso de video puede producir un archivo sin audio.', 'El descargador busca una pista de audio correspondiente. Los GIF, las publicaciones silenciosas y el audio inaccesible no aportan sonido.', 'Si ambas pistas son accesibles, se combinan para guardarlas. La cola muestra el procesamiento y guardado; iniciar la tarea no significa que el archivo ya esté guardado.'],
        faqs: [
            { q: '¿Todos los videos se descargan con sonido?', a: 'Solo si existe una pista de audio accesible. No se puede recrear un sonido que no está en el original. Si la publicación tiene sonido y el archivo no, vuelve a intentar con el enlace original.' },
            { q: '¿Enlace de publicación o dirección v.redd.it?', a: 'Usa un enlace de publicación o un enlace compartido de Reddit compatible. Este formulario no acepta recursos CDN directos ni listas de un subreddit.' },
            { q: '¿Qué ocurre con GIF y videos externos?', a: 'Un GIF nativo puede guardarse como GIF y no tiene audio. Para videos enlazados desde otra plataforma, usa su descargador. No se recuperan medios borrados o inaccesibles.' },
        ],
    },
    fr: {
        h1: 'Télécharger une vidéo Reddit avec le son',
        steps: ['Copiez le lien original de la publication vidéo via Partager sur Reddit.', 'Collez-le dans ce formulaire et lancez le téléchargement. Le son original accessible est conservé.', 'Suivez la tâche dans la file, puis vérifiez l’image et le son du fichier enregistré.'],
        lede: 'Collez le lien d’une publication Reddit publique. La piste audio est réunie avec la vidéo lorsqu’elle est accessible. Une source muette reste muette.',
        featuresTitle: 'Où est passé le son de la vidéo Reddit ?',
        features: ['La piste vidéo', 'La piste audio séparée', 'Un fichier à enregistrer'],
        facts: ['Reddit peut diffuser l’image et le son séparément. Enregistrer uniquement la ressource vidéo peut donner un fichier muet.', 'Le téléchargeur recherche la piste audio correspondante. Un GIF, une vidéo muette ou une source audio inaccessible ne fournit pas de son.', 'Si les deux pistes sont accessibles, elles sont réunies pour l’enregistrement. La file indique la progression : une tâche démarrée ne signifie pas que le fichier est déjà enregistré.'],
        faqs: [
            { q: 'Chaque vidéo téléchargée aura-t-elle du son ?', a: 'Seulement si une piste audio est accessible. Un son absent de la source ne peut pas être recréé. Si la publication a du son mais pas le fichier, réessayez avec le lien original.' },
            { q: 'Lien de publication ou adresse v.redd.it ?', a: 'Utilisez le lien de la publication ou un lien de partage Reddit pris en charge. Ce formulaire n’accepte pas les ressources CDN brutes ni les flux de subreddit.' },
            { q: 'Et les GIF et vidéos externes ?', a: 'Un GIF natif peut être enregistré en GIF, sans piste audio. Pour une vidéo d’une autre plateforme, utilisez son téléchargeur. Les médias supprimés ou inaccessibles ne peuvent pas être restaurés ici.' },
        ],
    },
    ja: {
        h1: 'Reddit動画を音声付きでダウンロード',
        steps: ['Reddit動画の元投稿で共有メニューからリンクをコピーします。', 'このフォームに貼り付けてダウンロードを開始します。取得可能な元の音声を保持します。', 'キューで進行状況を確認し、保存後のファイルを再生して映像と音声を確認します。'],
        lede: '公開Reddit投稿のリンクを貼り付けます。対応する音声トラックにアクセスできる場合は映像と結合します。元から無音の動画に音声は追加されません。',
        featuresTitle: 'Reddit動画を保存すると音が消える理由',
        features: ['映像トラック', '別の音声トラック', 'まとめて保存'],
        facts: ['Redditでは映像と音声が別々に配信される場合があります。映像のリソースだけを保存すると、無音のファイルになることがあります。', '対応する音声トラックを探します。GIF、無音の投稿、アクセスできない音声には音を付けられません。', '両方のトラックにアクセスできる場合は結合して保存します。処理と保存の進行状況はキューで確認できます。開始しただけでは保存完了ではありません。'],
        faqs: [
            { q: 'すべての動画を音声付きで保存できますか？', a: 'アクセス可能な音声トラックがある場合のみです。元の音声が存在しない場合は復元できません。投稿では音が出るのに保存ファイルが無音なら、元の投稿リンクで再試行してください。' },
            { q: '投稿リンクとv.redd.itのどちらを使いますか？', a: 'Reddit投稿リンクか対応する共有リンクを使ってください。このフォームではCDNの直接リンクやコミュニティの一覧は受け付けません。' },
            { q: 'GIFや外部サイトの動画には対応しますか？', a: 'ネイティブGIFはGIFで保存される場合があり、音声はありません。外部サイトの動画は対応するサービスのダウンローダーを使ってください。削除済みやアクセスできないメディアは復元できません。' },
        ],
    },
    ko: {
        h1: 'Reddit 동영상 소리와 함께 다운로드',
        steps: ['Reddit 원본 동영상 게시물의 공유 메뉴에서 링크를 복사하세요.', '이 양식에 링크를 붙여넣고 다운로드하세요. 접근 가능한 원본 오디오를 유지합니다.', '대기열에서 작업을 확인하고 저장 후 파일을 재생해 영상과 소리를 확인하세요.'],
        lede: '공개 Reddit 게시물 링크를 붙여넣으세요. 접근 가능한 오디오 트랙이 있으면 영상과 합칩니다. 원래 무음인 영상에 소리를 만들지는 않습니다.',
        featuresTitle: 'Reddit 영상을 저장하면 왜 소리가 없을까요?',
        features: ['영상 트랙', '별도의 오디오 트랙', '하나의 저장 파일'],
        facts: ['Reddit은 영상과 소리를 따로 전송할 수 있습니다. 영상 리소스만 저장하면 소리 없는 파일이 될 수 있습니다.', '일치하는 오디오 트랙을 확인합니다. GIF, 무음 게시물, 접근할 수 없는 오디오에는 소리를 추가할 수 없습니다.', '두 트랙에 접근할 수 있으면 합쳐서 저장합니다. 처리와 저장 진행 상태는 대기열에 표시됩니다. 작업 시작이 저장 완료를 뜻하지는 않습니다.'],
        faqs: [
            { q: '모든 Reddit 영상을 소리와 함께 저장하나요?', a: '접근 가능한 오디오 트랙이 있을 때만 가능합니다. 원본에 없는 소리는 복원할 수 없습니다. 게시물은 소리가 나는데 파일이 무음이면 원본 게시물 링크로 다시 시도하세요.' },
            { q: '게시물 링크와 v.redd.it 주소 중 무엇을 쓰나요?', a: 'Reddit 게시물 링크나 지원되는 공유 링크를 사용하세요. 이 양식은 CDN 직접 주소나 서브레딧 목록을 받지 않습니다.' },
            { q: 'GIF나 외부 동영상은 어떻게 처리하나요?', a: '네이티브 GIF는 GIF로 저장될 수 있으며 소리가 없습니다. 다른 플랫폼의 영상은 해당 다운로드 페이지를 사용하세요. 삭제되거나 접근할 수 없는 미디어는 복구할 수 없습니다.' },
        ],
    },
    ru: {
        h1: 'Скачать видео Reddit со звуком',
        steps: ['Скопируйте ссылку на исходный видеопост через меню «Поделиться» в Reddit.', 'Вставьте её в эту форму и запустите загрузку. Доступный оригинальный звук сохраняется.', 'Следите за задачей в очереди, затем проверьте изображение и звук сохранённого файла.'],
        lede: 'Вставьте ссылку на публичный пост Reddit. Доступная звуковая дорожка объединяется с видео. Если исходник без звука, звук не появится.',
        featuresTitle: 'Почему у скачанного видео Reddit нет звука?',
        features: ['Видеодорожка', 'Отдельная аудиодорожка', 'Один файл для сохранения'],
        facts: ['Reddit может передавать изображение и звук отдельно. Сохранение только видеоресурса может дать немой файл.', 'Загрузчик ищет соответствующую аудиодорожку. У GIF, немого исходника или недоступного аудио нет звука для добавления.', 'Если обе дорожки доступны, они объединяются для сохранения. Очередь показывает обработку и сохранение; запуск задачи ещё не означает, что файл сохранён.'],
        faqs: [
            { q: 'Все видео скачиваются со звуком?', a: 'Только если есть доступная аудиодорожка. Отсутствующий в исходнике звук восстановить нельзя. Если пост звучит, а файл нет, повторите попытку с исходной ссылкой на пост.' },
            { q: 'Нужна ссылка на пост или v.redd.it?', a: 'Используйте ссылку на пост Reddit или поддерживаемую ссылку общего доступа. Форма не принимает прямые CDN-адреса и ленты сообществ.' },
            { q: 'Что с GIF и внешними видео?', a: 'Нативный GIF может сохраняться как GIF без звука. Для видео с другой платформы используйте её загрузчик. Удалённые или недоступные медиа здесь не восстановить.' },
        ],
    },
    th: {
        h1: 'ดาวน์โหลดวิดีโอ Reddit พร้อมเสียง',
        steps: ['คัดลอกลิงก์โพสต์วิดีโอต้นฉบับจากเมนูแชร์ใน Reddit', 'วางลิงก์ในแบบฟอร์มนี้แล้วเริ่มดาวน์โหลด ระบบคงเสียงต้นฉบับที่เข้าถึงได้', 'ติดตามงานในคิว หลังบันทึกเสร็จให้เปิดไฟล์เพื่อตรวจภาพและเสียง'],
        lede: 'วางลิงก์โพสต์ Reddit สาธารณะ ระบบจะรวมเสียงกับวิดีโอเมื่อเข้าถึงแทร็กเสียงที่ตรงกันได้ วิดีโอที่ไม่มีเสียงต้นฉบับจะยังคงไม่มีเสียง',
        featuresTitle: 'ทำไมวิดีโอ Reddit ที่บันทึกจึงไม่มีเสียง?',
        features: ['แทร็กวิดีโอ', 'แทร็กเสียงแยก', 'ไฟล์สำหรับบันทึก'],
        facts: ['Reddit อาจส่งภาพและเสียงแยกกัน การบันทึกเฉพาะวิดีโอจึงอาจได้ไฟล์ที่ไม่มีเสียง', 'ระบบค้นหาแทร็กเสียงที่ตรงกัน GIF วิดีโอต้นฉบับที่เงียบ หรือเสียงที่เข้าถึงไม่ได้ จะไม่สามารถเพิ่มเสียงได้', 'เมื่อเข้าถึงทั้งสองแทร็กได้ ระบบจะรวมเพื่อบันทึก ดูความคืบหน้าได้ในคิว การเริ่มงานไม่ได้หมายความว่าบันทึกไฟล์เสร็จแล้ว'],
        faqs: [
            { q: 'ทุกวิดีโอจะมีเสียงหรือไม่?', a: 'เฉพาะเมื่อมีแทร็กเสียงที่เข้าถึงได้ ระบบสร้างเสียงต้นฉบับที่ไม่มีอยู่ไม่ได้ หากโพสต์มีเสียงแต่ไฟล์ไม่มี ให้ลองลิงก์โพสต์ต้นฉบับอีกครั้ง' },
            { q: 'ควรใช้ลิงก์โพสต์หรือ v.redd.it?', a: 'ใช้ลิงก์โพสต์ Reddit หรือลิงก์แชร์ที่รองรับ แบบฟอร์มนี้ไม่รับลิงก์ CDN โดยตรงหรือหน้ารวมของชุมชน' },
            { q: 'GIF และวิดีโอจากเว็บอื่นล่ะ?', a: 'GIF ของ Reddit อาจบันทึกเป็น GIF และไม่มีเสียง วิดีโอจากแพลตฟอร์มอื่นควรใช้หน้าดาวน์โหลดของแพลตฟอร์มนั้น ไม่สามารถกู้คืนสื่อที่ถูกลบหรือเข้าถึงไม่ได้' },
        ],
    },
    vi: {
        h1: 'Tải video Reddit có âm thanh',
        steps: ['Sao chép liên kết bài đăng video gốc từ menu Chia sẻ của Reddit.', 'Dán vào biểu mẫu này và bắt đầu tải. Âm thanh gốc truy cập được sẽ được giữ lại.', 'Theo dõi tác vụ trong hàng đợi, rồi phát tệp đã lưu để kiểm tra cả hình và tiếng.'],
        lede: 'Dán liên kết bài đăng Reddit công khai. Âm thanh được ghép với video khi có bản âm thanh tương ứng truy cập được. Nguồn không tiếng vẫn không tiếng.',
        featuresTitle: 'Vì sao video Reddit tải về bị mất tiếng?',
        features: ['Luồng hình ảnh', 'Luồng âm thanh riêng', 'Một tệp để lưu'],
        facts: ['Reddit có thể truyền hình ảnh và âm thanh riêng. Chỉ lưu tài nguyên video có thể tạo ra tệp không tiếng.', 'Trình tải tìm bản âm thanh tương ứng. GIF, video gốc không tiếng hoặc nguồn âm thanh không truy cập được không thể cung cấp tiếng.', 'Khi cả hai luồng truy cập được, chúng được ghép để lưu. Hàng đợi hiển thị tiến độ xử lý và lưu; bắt đầu tác vụ không có nghĩa là đã lưu xong.'],
        faqs: [
            { q: 'Video nào cũng tải được cả tiếng sao?', a: 'Chỉ khi có bản âm thanh truy cập được. Không thể tái tạo tiếng vốn không có trong nguồn. Nếu bài đăng có tiếng nhưng tệp không có, hãy thử lại bằng liên kết gốc.' },
            { q: 'Dùng liên kết bài đăng hay v.redd.it?', a: 'Dùng liên kết bài đăng Reddit hoặc liên kết chia sẻ được hỗ trợ. Biểu mẫu không nhận địa chỉ CDN trực tiếp hay trang danh sách cộng đồng.' },
            { q: 'Còn GIF và video từ trang khác?', a: 'GIF gốc có thể được lưu dạng GIF và không có âm thanh. Với video liên kết từ nền tảng khác, dùng trang tải tương ứng. Không thể khôi phục nội dung đã xóa hoặc không truy cập được.' },
        ],
    },
    id: {
        h1: 'Unduh Video Reddit dengan Suara',
        steps: ['Salin tautan postingan video asli dari menu Bagikan di Reddit.', 'Tempel di formulir ini dan mulai unduhan. Audio asli yang tersedia tetap disertakan.', 'Ikuti tugas di antrean, lalu putar berkas tersimpan untuk memeriksa gambar dan suara.'],
        lede: 'Tempel tautan postingan Reddit publik. Trek audio yang cocok digabungkan dengan video jika dapat diakses. Sumber tanpa suara tetap tanpa suara.',
        featuresTitle: 'Mengapa suara video Reddit hilang saat disimpan?',
        features: ['Trek video', 'Trek audio terpisah', 'Satu berkas untuk disimpan'],
        facts: ['Reddit dapat mengirim gambar dan suara secara terpisah. Menyimpan sumber video saja bisa menghasilkan berkas tanpa suara.', 'Pengunduh mencari trek audio yang cocok. GIF, unggahan tanpa suara, dan audio yang tidak dapat diakses tidak menyediakan suara.', 'Jika kedua trek dapat diakses, keduanya digabungkan untuk disimpan. Antrean menunjukkan proses dan penyimpanan; tugas dimulai belum berarti berkas sudah tersimpan.'],
        faqs: [
            { q: 'Apakah semua video diunduh dengan suara?', a: 'Hanya jika ada trek audio yang dapat diakses. Suara yang tidak ada pada sumber tidak dapat dibuat ulang. Jika postingan bersuara tetapi berkas tidak, coba lagi dengan tautan asli.' },
            { q: 'Tautan postingan atau alamat v.redd.it?', a: 'Gunakan tautan postingan Reddit atau tautan berbagi yang didukung. Formulir ini tidak menerima alamat CDN langsung atau daftar komunitas.' },
            { q: 'Bagaimana dengan GIF dan video eksternal?', a: 'GIF asli dapat disimpan sebagai GIF tanpa suara. Untuk video dari platform lain, gunakan pengunduh platform tersebut. Media yang dihapus atau tidak dapat diakses tidak bisa dipulihkan di sini.' },
        ],
    },
};

export const pinterestEditorial: Record<string, EditorialCopy> = {
    en: {
        h1: 'Pinterest Video Downloader',
        steps: ['Open the individual Pin and use Share to copy its Pinterest or pin.it link.', 'Paste that Pin link here. The downloader looks for video before falling back to an available image or GIF.', 'Check the saved file type: MP4 is video, JPG is a still image, and GIF is animated media.'],
        lede: 'Open one Pin, copy its Pinterest or pin.it link, and save the media it actually exposes. A video Pin can yield an MP4; an image Pin is not a video waiting to be converted.',
        featuresTitle: 'A Pin can contain different kinds of media',
        features: ['Video Pin · MP4', 'Image Pin · JPG', 'Animated media · GIF'],
        facts: ['The downloader looks for video first, including a stream that may need processing before MP4 saving. A preview image alone does not prove that a video is available.', 'If no video is detected, an available image may be returned. An image result can also mean the video was not exposed to the parser; check the original Pin before retrying.', 'If the detected fallback is a GIF, it is saved as animated media. A JPG thumbnail is a still image and cannot recreate a missing animation.'],
        faqs: [
            { q: 'Why did I get a picture instead of a Pinterest video?', a: 'The Pin may be an image, or its video resource may not be accessible to the downloader. Open the Pin and check whether it actually plays, then copy that specific Pin link again. A returned picture is not proof that the video was downloaded.' },
            { q: 'Can I download a whole Pinterest board?', a: 'This page processes one Pin at a time. A board, profile, search page, or collection of Pins is not a supported single-Pin input.' },
            { q: 'Is saving a Pin the same as downloading it?', a: 'Saving a Pin on Pinterest adds it to a board. Downloading writes a media file to your device. On a phone, check the browser Downloads list or Files app; a file may not be added to Photos automatically.' },
        ],
    },
    zh: {
        h1: 'Pinterest 视频下载：从单个 Pin 保存媒体',
        steps: ['打开具体 Pin，通过分享菜单复制 Pinterest 或 pin.it 链接。', '粘贴到本页；下载器先找视频，未找到时才尝试可用的图片或 GIF。', '检查保存的文件类型：MP4 是视频，JPG 是静态图片，GIF 是动态媒体。'],
        lede: '打开具体 Pin，复制 Pinterest 或 pin.it 分享链接，保存其中实际可获取的媒体。视频 Pin 可能得到 MP4；图片 Pin 并不是等待转换的视频。',
        featuresTitle: '先分清这个 Pin 里是什么',
        features: ['视频 Pin · MP4', '图片 Pin · JPG', '动态媒体 · GIF'],
        facts: ['下载器优先寻找视频，包括需要处理后才能保存为 MP4 的流。仅有封面图，并不能证明视频资源可用。', '未检测到视频时，可能返回可用图片。图片结果也可能意味着解析器未能获取视频，请先检查原 Pin，再决定是否重试。', '检测到的回退资源是 GIF 时，按动态媒体保存。JPG 缩略图是静态图片，不能还原缺失的动画。'],
        faqs: [
            { q: '为什么想下载视频，得到的却是一张图？', a: '这个 Pin 可能本来就是图片，也可能是下载器无法访问它的视频资源。请打开原 Pin 确认能否播放，再复制具体 Pin 的链接重试。返回图片不代表视频已下载成功。' },
            { q: '能下载整个 Pinterest 画板吗？', a: '本页一次处理一个 Pin。画板、个人主页、搜索结果和多个 Pin 的集合，都不属于单个 Pin 链接。' },
            { q: '收藏 Pin 和下载有什么区别？', a: '在 Pinterest 收藏，是将 Pin 加入画板。下载则是在设备上保存媒体文件。手机上请检查浏览器下载列表或“文件”应用，文件不一定自动进入相册。' },
        ],
    },
    de: {
        h1: 'Pinterest-Videos aus einem Pin herunterladen',
        steps: ['Öffne den einzelnen Pin und kopiere über Teilen seinen Pinterest- oder pin.it-Link.', 'Füge den Link hier ein. Zuerst wird nach Video gesucht, danach gegebenenfalls nach Bild oder GIF.', 'Prüfe den Dateityp: MP4 ist Video, JPG ein Standbild und GIF eine Animation.'],
        lede: 'Öffne einen Pin und kopiere seinen Pinterest- oder pin.it-Link. Gespeichert wird das verfügbare Medium: Ein Video kann MP4 liefern, ein Bild ist kein konvertierbares Video.',
        featuresTitle: 'Welches Medium steckt in diesem Pin?',
        features: ['Video-Pin · MP4', 'Bild-Pin · JPG', 'Animation · GIF'],
        facts: ['Zuerst wird nach Video gesucht, auch nach Streams, die vor dem Speichern verarbeitet werden müssen. Ein Vorschaubild allein belegt kein verfügbares Video.', 'Wird kein Video erkannt, kann ein verfügbares Bild zurückgegeben werden. Möglicherweise war das Video für den Parser nicht zugänglich. Prüfe den ursprünglichen Pin.', 'Eine erkannte GIF-Ressource wird als Animation gespeichert. Ein JPG-Vorschaubild ist statisch und kann keine fehlende Animation wiederherstellen.'],
        faqs: [
            { q: 'Warum erhalte ich ein Bild statt eines Videos?', a: 'Der Pin kann ein Bild sein oder sein Video ist nicht zugänglich. Prüfe, ob der ursprüngliche Pin abspielt, und kopiere genau diesen Link erneut. Ein Bild bedeutet nicht, dass das Video gespeichert wurde.' },
            { q: 'Kann ich eine ganze Pinnwand herunterladen?', a: 'Diese Seite verarbeitet jeweils einen Pin. Pinnwände, Profile und Suchseiten sind keine unterstützten Einzel-Pin-Links.' },
            { q: 'Ist Merken dasselbe wie Herunterladen?', a: 'Merken fügt einen Pin einer Pinnwand hinzu. Herunterladen speichert eine Datei auf deinem Gerät. Auf dem Handy findest du sie in den Browser-Downloads oder der Dateien-App, nicht unbedingt in Fotos.' },
        ],
    },
    es: {
        h1: 'Descargar videos de un Pin de Pinterest',
        steps: ['Abre el Pin individual y copia su enlace de Pinterest o pin.it desde Compartir.', 'Pégalo aquí. Se busca video primero y después una imagen o GIF disponible como alternativa.', 'Comprueba el archivo: MP4 es video, JPG es imagen fija y GIF es animación.'],
        lede: 'Abre un Pin y copia su enlace de Pinterest o pin.it. Guarda el medio que esté disponible: un video puede dar un MP4; una imagen no es un video por convertir.',
        featuresTitle: '¿Qué tipo de medio contiene este Pin?',
        features: ['Pin de video · MP4', 'Pin de imagen · JPG', 'Animación · GIF'],
        facts: ['Primero se busca video, incluidos flujos que requieren procesamiento antes de guardarse. Una portada no demuestra que el video esté disponible.', 'Si no se detecta video, se puede devolver una imagen. También puede significar que el analizador no pudo acceder al video. Comprueba el Pin original.', 'Si se detecta un GIF como alternativa, se guarda como animación. Una miniatura JPG es estática y no puede recuperar una animación ausente.'],
        faqs: [
            { q: '¿Por qué recibí una imagen en lugar de un video?', a: 'El Pin puede ser una imagen o su video puede ser inaccesible. Comprueba si el Pin original se reproduce y copia ese enlace de nuevo. Recibir una imagen no significa que se haya descargado el video.' },
            { q: '¿Puedo descargar un tablero completo?', a: 'Esta página procesa un Pin cada vez. Los tableros, perfiles y páginas de búsqueda no son enlaces individuales compatibles.' },
            { q: '¿Guardar un Pin es lo mismo que descargarlo?', a: 'Guardar en Pinterest añade el Pin a un tablero. Descargar crea un archivo en tu dispositivo. En el móvil, revisa Descargas del navegador o Archivos; puede no aparecer automáticamente en Fotos.' },
        ],
    },
    fr: {
        h1: 'Télécharger la vidéo d’une épingle Pinterest',
        steps: ['Ouvrez l’épingle précise et copiez son lien Pinterest ou pin.it via Partager.', 'Collez-le ici. La vidéo est recherchée avant une éventuelle image ou un GIF de remplacement.', 'Vérifiez le fichier : MP4 est une vidéo, JPG une image fixe et GIF une animation.'],
        lede: 'Ouvrez une épingle et copiez son lien Pinterest ou pin.it. Enregistrez le média disponible : une vidéo peut fournir un MP4, une image ne se transforme pas en vidéo.',
        featuresTitle: 'Quel média contient cette épingle ?',
        features: ['Épingle vidéo · MP4', 'Épingle image · JPG', 'Animation · GIF'],
        facts: ['La recherche privilégie la vidéo, y compris les flux à traiter avant enregistrement. Une image d’aperçu ne prouve pas que la vidéo est disponible.', 'Sans vidéo détectée, une image disponible peut être renvoyée. Il se peut aussi que la vidéo soit inaccessible au parseur. Vérifiez l’épingle originale.', 'Une ressource GIF détectée en remplacement est enregistrée comme animation. Une miniature JPG est fixe et ne peut pas recréer une animation manquante.'],
        faqs: [
            { q: 'Pourquoi ai-je une image au lieu d’une vidéo ?', a: 'L’épingle peut être une image, ou sa vidéo peut être inaccessible. Vérifiez si elle se lit sur Pinterest et recopiez son lien précis. Une image reçue ne signifie pas que la vidéo a été téléchargée.' },
            { q: 'Puis-je télécharger un tableau entier ?', a: 'Cette page traite une épingle à la fois. Les tableaux, profils et recherches ne sont pas des liens d’épingle pris en charge.' },
            { q: 'Enregistrer une épingle et la télécharger, est-ce pareil ?', a: 'Sur Pinterest, enregistrer ajoute l’épingle à un tableau. Télécharger crée un fichier sur votre appareil. Sur mobile, vérifiez les téléchargements du navigateur ou Fichiers ; il ne rejoint pas toujours Photos.' },
        ],
    },
    ja: {
        h1: 'Pinterestのピンから動画をダウンロード',
        steps: ['対象のピンを開き、共有メニューからPinterestまたはpin.itのリンクをコピーします。', 'ここに貼り付けます。最初に動画を探し、見つからない場合に取得可能な画像やGIFを探します。', '保存ファイルを確認します。MP4は動画、JPGは静止画、GIFはアニメーションです。'],
        lede: 'ピンを開き、Pinterestまたはpin.itのリンクをコピーします。取得できるメディアを保存します。動画ならMP4になる場合がありますが、画像を動画に変換する機能ではありません。',
        featuresTitle: 'このピンに含まれるメディアは？',
        features: ['動画ピン · MP4', '画像ピン · JPG', 'アニメーション · GIF'],
        facts: ['最初に動画を探します。保存前の処理が必要なストリームも対象です。プレビュー画像だけでは動画が取得できるとは限りません。', '動画を検出できない場合は画像を返すことがあります。解析側から動画にアクセスできなかった可能性もあるため、元のピンを確認してください。', '代わりにGIFを検出した場合はアニメーションとして保存します。JPGのサムネイルは静止画であり、欠けたアニメーションを復元できません。'],
        faqs: [
            { q: '動画ではなく画像が返されるのはなぜですか？', a: '画像ピンであるか、動画リソースにアクセスできない可能性があります。元のピンで再生できるか確認し、そのピンのリンクをコピーし直してください。画像の取得は動画の保存完了ではありません。' },
            { q: 'ボード全体をダウンロードできますか？', a: 'このページは一度に1つのピンを処理します。ボード、プロフィール、検索ページは対象のピンリンクではありません。' },
            { q: 'ピンの保存とダウンロードの違いは？', a: 'Pinterest上の保存はボードへの追加です。ダウンロードは端末へのファイル保存です。スマートフォンではブラウザのダウンロード一覧やファイルアプリを確認してください。写真に自動追加されるとは限りません。' },
        ],
    },
    ko: {
        h1: 'Pinterest 핀에서 동영상 다운로드',
        steps: ['개별 핀을 열고 공유 메뉴에서 Pinterest 또는 pin.it 링크를 복사하세요.', '여기에 붙여넣으세요. 먼저 동영상을 찾고 없으면 접근 가능한 이미지나 GIF를 확인합니다.', '저장 파일을 확인하세요. MP4는 동영상, JPG는 정지 이미지, GIF는 움직이는 이미지입니다.'],
        lede: '핀을 열고 Pinterest 또는 pin.it 링크를 복사하세요. 실제로 제공되는 미디어를 저장합니다. 동영상은 MP4로 받을 수 있지만 이미지를 동영상으로 만드는 기능은 아닙니다.',
        featuresTitle: '이 핀에는 어떤 미디어가 있나요?',
        features: ['동영상 핀 · MP4', '이미지 핀 · JPG', '움직이는 미디어 · GIF'],
        facts: ['먼저 동영상을 찾습니다. 저장 전 처리가 필요한 스트림도 포함됩니다. 미리보기 이미지만으로 동영상 제공 여부를 판단할 수는 없습니다.', '동영상이 감지되지 않으면 이미지를 반환할 수 있습니다. 분석기가 동영상에 접근하지 못했을 수도 있으니 원본 핀을 확인하세요.', '대체 리소스로 GIF가 감지되면 움직이는 미디어로 저장합니다. JPG 썸네일은 정지 이미지이며 없는 애니메이션을 복원할 수 없습니다.'],
        faqs: [
            { q: '왜 동영상 대신 이미지가 나오나요?', a: '이미지 핀이거나 동영상 리소스에 접근할 수 없을 수 있습니다. 원본 핀이 재생되는지 확인하고 해당 링크를 다시 복사하세요. 이미지 반환은 동영상 다운로드 완료를 뜻하지 않습니다.' },
            { q: '보드 전체를 다운로드할 수 있나요?', a: '이 페이지는 한 번에 핀 하나를 처리합니다. 보드, 프로필, 검색 페이지는 개별 핀 링크가 아닙니다.' },
            { q: '핀 저장과 다운로드는 무엇이 다른가요?', a: 'Pinterest의 저장은 보드에 핀을 추가하는 것입니다. 다운로드는 기기에 파일을 저장합니다. 모바일에서는 브라우저 다운로드 목록이나 파일 앱을 확인하세요. 사진 앱에 자동 추가되지 않을 수 있습니다.' },
        ],
    },
    ru: {
        h1: 'Скачать видео из пина Pinterest',
        steps: ['Откройте отдельный пин и скопируйте ссылку Pinterest или pin.it через меню общего доступа.', 'Вставьте её здесь. Сначала ищется видео, затем доступное изображение или GIF.', 'Проверьте тип файла: MP4 — видео, JPG — статичное изображение, GIF — анимация.'],
        lede: 'Откройте пин и скопируйте ссылку Pinterest или pin.it. Сохраняется доступное медиа: видео может дать MP4, а картинка не превращается в видео.',
        featuresTitle: 'Какое медиа содержит этот пин?',
        features: ['Видеопин · MP4', 'Пин-картинка · JPG', 'Анимация · GIF'],
        facts: ['Сначала ищется видео, включая потоки, требующие обработки перед сохранением. Обложка сама по себе не означает, что видео доступно.', 'Если видео не обнаружено, может вернуться изображение. Возможно, видео было недоступно парсеру. Проверьте исходный пин.', 'Если обнаружен резервный GIF, он сохраняется как анимация. Миниатюра JPG статична и не восстановит отсутствующую анимацию.'],
        faqs: [
            { q: 'Почему вместо видео получилась картинка?', a: 'Пин может быть изображением либо видео недоступно. Проверьте воспроизведение исходного пина и скопируйте именно его ссылку ещё раз. Получение картинки не означает загрузку видео.' },
            { q: 'Можно скачать всю доску?', a: 'Эта страница обрабатывает один пин за раз. Доски, профили и страницы поиска не являются ссылками на отдельный пин.' },
            { q: 'Сохранить пин и скачать — это одно и то же?', a: 'Сохранение в Pinterest добавляет пин на доску. Скачивание записывает файл на устройство. На телефоне проверьте загрузки браузера или приложение «Файлы»: медиа не всегда попадает в «Фото» автоматически.' },
        ],
    },
    th: {
        h1: 'ดาวน์โหลดวิดีโอจากพิน Pinterest',
        steps: ['เปิดพินที่ต้องการแล้วคัดลอกลิงก์ Pinterest หรือ pin.it จากเมนูแชร์', 'วางลิงก์ที่นี่ ระบบค้นหาวิดีโอก่อน แล้วจึงลองรูปภาพหรือ GIF ที่เข้าถึงได้', 'ตรวจชนิดไฟล์ที่บันทึก MP4 คือวิดีโอ JPG คือภาพนิ่ง และ GIF คือภาพเคลื่อนไหว'],
        lede: 'เปิดพินแล้วคัดลอกลิงก์ Pinterest หรือ pin.it เพื่อบันทึกสื่อที่เข้าถึงได้ พินวิดีโออาจได้ไฟล์ MP4 แต่พินรูปภาพไม่ใช่วิดีโอที่รอแปลง',
        featuresTitle: 'พินนี้มีสื่อประเภทใด?',
        features: ['พินวิดีโอ · MP4', 'พินรูปภาพ · JPG', 'ภาพเคลื่อนไหว · GIF'],
        facts: ['ระบบค้นหาวิดีโอก่อน รวมถึงสตรีมที่ต้องประมวลผลก่อนบันทึก มีเพียงภาพปกไม่ได้แปลว่าวิดีโอพร้อมให้ดาวน์โหลด', 'หากไม่พบวิดีโอ อาจคืนรูปภาพที่มีอยู่ หรืออาจเป็นเพราะระบบเข้าถึงวิดีโอไม่ได้ โปรดตรวจสอบพินต้นฉบับ', 'หากพบ GIF เป็นสื่อสำรอง จะบันทึกเป็นภาพเคลื่อนไหว ภาพย่อ JPG เป็นภาพนิ่งและไม่สามารถสร้างภาพเคลื่อนไหวที่ขาดหายไปได้'],
        faqs: [
            { q: 'ทำไมได้รูปภาพแทนวิดีโอ?', a: 'พินอาจเป็นรูปภาพหรือระบบเข้าถึงวิดีโอไม่ได้ ตรวจสอบว่าพินต้นฉบับเล่นได้หรือไม่ แล้วคัดลอกลิงก์พินนั้นอีกครั้ง การได้รูปภาพไม่ได้แปลว่าดาวน์โหลดวิดีโอแล้ว' },
            { q: 'ดาวน์โหลดทั้งบอร์ดได้ไหม?', a: 'หน้านี้ประมวลผลครั้งละหนึ่งพิน บอร์ด โปรไฟล์ และหน้าค้นหาไม่ใช่ลิงก์พินเดี่ยวที่รองรับ' },
            { q: 'บันทึกพินกับดาวน์โหลดต่างกันอย่างไร?', a: 'บันทึกใน Pinterest คือเพิ่มพินลงบอร์ด ส่วนดาวน์โหลดคือบันทึกไฟล์ลงอุปกรณ์ บนมือถือให้ตรวจรายการดาวน์โหลดของเบราว์เซอร์หรือแอปไฟล์ สื่ออาจไม่เข้าแอปรูปภาพโดยอัตโนมัติ' },
        ],
    },
    vi: {
        h1: 'Tải video từ một Pin Pinterest',
        steps: ['Mở Pin cụ thể và sao chép liên kết Pinterest hoặc pin.it từ menu Chia sẻ.', 'Dán vào đây. Trình tải tìm video trước, sau đó mới thử ảnh hoặc GIF có thể truy cập.', 'Kiểm tra tệp đã lưu: MP4 là video, JPG là ảnh tĩnh và GIF là ảnh động.'],
        lede: 'Mở một Pin và sao chép liên kết Pinterest hoặc pin.it. Lưu đúng loại nội dung có thể truy cập: video có thể cho tệp MP4, còn ảnh không phải video để chuyển đổi.',
        featuresTitle: 'Pin này chứa loại nội dung nào?',
        features: ['Pin video · MP4', 'Pin ảnh · JPG', 'Ảnh động · GIF'],
        facts: ['Trình tải ưu tiên tìm video, kể cả luồng cần xử lý trước khi lưu. Chỉ có ảnh bìa không chứng minh video có thể tải được.', 'Nếu không phát hiện video, có thể trả về ảnh. Cũng có thể trình phân tích không truy cập được video. Hãy kiểm tra Pin gốc.', 'Nếu tài nguyên thay thế là GIF, nó được lưu dạng ảnh động. Ảnh thu nhỏ JPG là ảnh tĩnh và không thể tái tạo hoạt ảnh bị thiếu.'],
        faqs: [
            { q: 'Vì sao nhận được ảnh thay vì video?', a: 'Pin có thể là ảnh, hoặc video không truy cập được. Kiểm tra Pin gốc có phát được không rồi sao chép đúng liên kết đó. Nhận ảnh không có nghĩa là đã tải xong video.' },
            { q: 'Có tải cả bảng Pinterest được không?', a: 'Trang này xử lý từng Pin. Bảng, hồ sơ và trang tìm kiếm không phải liên kết Pin riêng được hỗ trợ.' },
            { q: 'Lưu Pin và tải xuống khác nhau thế nào?', a: 'Lưu trên Pinterest thêm Pin vào bảng. Tải xuống ghi tệp vào thiết bị. Trên điện thoại, xem danh sách tải của trình duyệt hoặc ứng dụng Tệp; tệp có thể không tự vào Ảnh.' },
        ],
    },
    id: {
        h1: 'Unduh Video dari Pin Pinterest',
        steps: ['Buka Pin tertentu dan salin tautan Pinterest atau pin.it dari menu Bagikan.', 'Tempel di sini. Pengunduh mencari video lebih dahulu, lalu gambar atau GIF yang tersedia.', 'Periksa jenis berkas: MP4 adalah video, JPG gambar diam, dan GIF animasi.'],
        lede: 'Buka satu Pin dan salin tautan Pinterest atau pin.it. Simpan media yang tersedia: video dapat menghasilkan MP4, sedangkan gambar bukan video untuk dikonversi.',
        featuresTitle: 'Media apa yang ada di Pin ini?',
        features: ['Pin video · MP4', 'Pin gambar · JPG', 'Animasi · GIF'],
        facts: ['Pengunduh mencari video terlebih dahulu, termasuk stream yang perlu diproses sebelum disimpan. Gambar pratinjau saja tidak membuktikan video tersedia.', 'Jika video tidak terdeteksi, gambar yang tersedia dapat dikembalikan. Mungkin juga video tidak dapat diakses parser. Periksa Pin aslinya.', 'Jika media cadangan yang terdeteksi adalah GIF, media disimpan sebagai animasi. Thumbnail JPG adalah gambar diam dan tidak dapat memulihkan animasi yang hilang.'],
        faqs: [
            { q: 'Mengapa hasilnya gambar, bukan video?', a: 'Pin mungkin berupa gambar, atau videonya tidak dapat diakses. Periksa apakah Pin asli bisa diputar lalu salin tautan Pin itu lagi. Mendapat gambar bukan berarti video sudah diunduh.' },
            { q: 'Bisakah mengunduh seluruh papan?', a: 'Halaman ini memproses satu Pin setiap kali. Papan, profil, dan halaman pencarian bukan tautan Pin individual yang didukung.' },
            { q: 'Apa beda menyimpan Pin dan mengunduhnya?', a: 'Menyimpan di Pinterest menambahkan Pin ke papan. Mengunduh menyimpan berkas ke perangkat. Di ponsel, periksa unduhan browser atau aplikasi File; berkas tidak selalu otomatis masuk ke Foto.' },
        ],
    },
};

export const socialPlatformForSlug = (slug: string): SocialPlatform | null =>
    slug === 'reddit-video-download' ? 'reddit' : slug === 'pinterest-video-download' ? 'pinterest' : null;

export function getSocialDownloadContent(
    platform: SocialPlatform, lang: string, base: SeoLandingLocaleContent,
): SeoLandingLocaleContent {
    const locales = platform === 'reddit' ? redditEditorial : pinterestEditorial;
    const copy = locales[lang] ?? locales.en;
    return {
        ...base, ...copy,
        metaTitle: `${copy.h1} - FreeSaveVideo`,
        metaDescription: copy.lede,
        heroTags: [],
    };
}
