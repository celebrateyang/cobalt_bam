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

FreeSaveVideo は、対応プラットフォームの公開コンテンツを保存するための Web ツールです。動画、音声、写真、GIF に対応し、スマートフォンとパソコンのどちらからでも利用できます。

公式サイトでは、[プライバシーポリシー](privacy)に記載した広告およびアクセス解析サービスを使用する場合があります。
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

ダウンロード要求は、解析またはファイル転送のためバックエンドへ送信されます。公式サイトでログインが必要な場合は、要求がアカウントに関連付けられることがあります。セキュリティ、ポイント計算、稼働確認、問題調査に必要な要求情報や状態が記録される場合があります。

追加の処理が必要な場合、FreeSaveVideo はファイルをリアルタイムで処理します。

トンネルリンクには推測や改ざんを防ぐ暗号鍵が含まれますが、サーバーに対して要求を匿名化するものではありません。保存情報、アクセス解析、広告については[プライバシーポリシー](privacy)をご確認ください。

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

