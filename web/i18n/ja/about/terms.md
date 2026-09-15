<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

この利用条件は公式の FreeSaveVideo サイトにのみ適用されます。第三者が運営するインスタンスを利用する場合は、その運営者の条件をご確認ください。

本サービスは、保存する権利のある公開コンテンツにのみ使用してください。アクセス制御、課金、DRM の回避には使用できません。
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

ダウンロード機能は、プラットフォームと本サービスが対応する公開コンテンツの保存を支援します。サーバーはリンクの解析、映像と音声の結合、またはファイル転送を行う場合があります。通常のトンネル処理ではメディアデータをメモリ上で処理し、恒久的なメディアファイルとしてディスクへ保存しません。

セキュリティ、ポイント計算、稼働確認、問題調査に必要な要求情報とアカウント情報は、[プライバシーポリシー](privacy)に従って処理されます。
</section>

<section id="responsibility">
<SectionHeading
    title={$t("about.heading.responsibility")}
    sectionId="responsibility"
/>

送信するリンク、保存したファイル、その利用および配布については利用者が責任を負います。自身が所有する、許可を得ている、または法律上保存できる公開コンテンツのみをダウンロードし、著作権、ライセンス、配信元プラットフォームの規約を守ってください。

教育、研究、引用に使用する場合は、適切に出典を示し、制作者の権利を尊重してください。公開されているコンテンツであっても、再配布や商用利用が自動的に許可されるわけではありません。
</section>

<section id="abuse">
<SectionHeading
    title={$t("about.heading.abuse")}
    sectionId="abuse"
/>

異常な利用、権利侵害、サービス妨害、または利用者やシステムに危険を及ぼす行為が確認された場合、アカウント、要求、配信元へのアクセスを制限または停止することがあります。

権利侵害の報告や利用上の問題は、[サポートページ](../../support)またはサイト内の問題報告機能からご連絡ください。
</section>
