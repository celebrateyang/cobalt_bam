<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { partners, contacts, docs } from "$lib/env";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="summary">
<SectionHeading
    title={$t("about.heading.summary")}
    sectionId="summary"
/>

FreeSaveVideo は、お気に入りのサイトにある公開コンテンツを保存するためのツールです。動画、音声、写真、GIF のリンクを貼り付けるだけで使えます。

広告、トラッカー、有料壁はありません。スマートフォンでもデスクトップでも動く Web アプリです。
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

バックエンドへのすべてのリクエストは匿名で、トンネルに関する情報は暗号化されます。
私たちは厳格なゼロログ方針をとり、個人を追跡しません。

追加の処理が必要な場合、FreeSaveVideo はファイルをリアルタイムで処理します。

[強制トンネル](../../settings/privacy#tunnel) を有効にすると、すべてのダウンロードファイルがトンネル経由で送信されます。
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

最新機能の [remuxing](../../remux) などは、デバイス上でローカルに動作します。
ローカルファイルをインターネットに送信しません。
</section>

