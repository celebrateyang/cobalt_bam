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

bamboo downloadは、お気に入りのウェブサイトから何でも保存できます：ビデオ、オーディオ、写真、GIF。リンクを貼り付けるだけで準備完了です！

広告、トラッカー、ペイウォール、その他のナンセンスはありません。必要なときにいつでもどこでも動作する便利なWebアプリです。
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

バックエンドへのすべてのリクエストは匿名であり、トンネルに関するすべての情報は暗号化されています。
私たちは厳格なゼロログポリシーを持っており、個人について*何も*追跡しません。

リクエストに追加の処理が必要な場合、bamboo downloadはファイルをオンザフライで処理します。
これは、処理された部分をディスクに保存することなく、クライアントに直接トンネリングすることによって行われます。
たとえば、この方法は、ソースサービスがビデオとオーディオチャンネルを別々のファイルとして提供する場合に使用されます。

さらに、[強制トンネリングを有効にする](../settings/privacy#tunnel)ことで、プライバシーを保護できます。
有効にすると、bamboo downloadはダウンロードされたすべてのファイルをトンネルします。
ネットワークプロバイダーでさえ、どこから何かをダウンロードしているかを知ることはありません。
彼らが見るのは、bamboo downloadインスタンスを使用していることだけです。
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

[リミックス](/remux)などの最新機能は、デバイス上でローカルに動作します。
デバイス上の処理は効率的で、インターネット経由で何も送信しません。
これは、できるだけ多くの処理をクライアントに移行するという将来の目標と完全に一致しています。
</section>
