<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

これらの条件は、公式のfreesavevideoインスタンスを使用する場合にのみ適用されます。
それ以外の場合は、正確な情報についてホスティング事業者に連絡する必要がある場合があります。
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

保存機能は、インターネットからコンテンツをダウンロードすることを簡素化し、保存されたコンテンツが何に使用されるかについて一切責任を負いません。
処理サーバーは高度なプロキシのように動作し、コンテンツをディスクに書き込むことはありません。
すべてはRAMで処理され、トンネルが完了すると永久に削除されます。
私たちはダウンロードログを持っておらず、誰も識別できません。

[プライバシーポリシーでトンネルの仕組みについて詳しく読むことができます。](privacy)
</section>

<section id="responsibility">
<SectionHeading
    title={$t("about.heading.responsibility")}
    sectionId="responsibility"
/>

あなた（エンドユーザー）は、私たちのツールで何をするか、結果として得られるコンテンツをどのように使用および配布するかについて責任を負います。
他人のコンテンツを使用する際は注意し、常にオリジナルのクリエイターをクレジットしてください。
条件やライセンスに違反しないようにしてください。

教育目的で使用する場合は、常にソースを引用し、オリジナルのクリエイターをクレジットしてください。

フェアユースとクレジットはすべての人に利益をもたらします。
</section>

<section id="abuse">
<SectionHeading
    title={$t("about.heading.abuse")}
    sectionId="abuse"
/>

freesavevideoは100%匿名であるため、私たちは悪用行為を自動的に検出する方法がありません。


このメールはユーザーサポート用ではありません。
問題が発生している場合は、[サポートページ](community)の任意の優先方法でお問い合わせください。
</section>
