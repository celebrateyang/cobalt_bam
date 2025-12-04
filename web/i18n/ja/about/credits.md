<script lang="ts">
    import { contacts, docs } from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
    import BetaTesters from "$components/misc/BetaTesters.svelte";
</script>

<section id="testers">
<SectionHeading
    title={$t("about.heading.testers")}
    sectionId="testers"
/>

アップデートを早期にテストし、安定していることを確認してくれた私たちのバグハンターたちに大きな感謝を送ります。
彼らはcobalt 10の出荷にも協力してくれました！
<BetaTesters />

すべてのリンクは外部リンクで、彼らの個人ウェブサイトやソーシャルメディアにつながっています。
</section>

<section id="meowbalt">
<SectionHeading
    title={$t("general.meowbalt")}
    sectionId="meowbalt"
/>

meowbaltはcobaltのスピーディーなマスコットです。彼は高速インターネットが大好きな、非常に表情豊かな猫です。

cobaltで見られるmeowbaltの素晴らしいすべての絵は、[GlitchyPSI](https://glitchypsi.xyz/)によって作成されました。
彼はキャラクターのオリジナルデザイナーでもあります。

GlitchyPSIの明示的な許可なしに、meowbaltのアートワークを使用または変更することはできません。

meowbaltキャラクターデザインを商業的に、またはファンアート以外の形で使用または変更することはできません。
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

cobalt処理サーバーはオープンソースで、[AGPL-3.0]({docs.apiLicense})の下でライセンスされています。

cobaltフロントエンドは[ソースファースト](https://sourcefirst.com/)で、[CC-BY-NC-SA 4.0]({docs.webLicense})の下でライセンスされています。
私たちは、詐欺師が私たちの作品から利益を得ることを阻止し、人々を欺いて私たちの公的アイデンティティを傷つける悪意のあるクローンを作成することを防ぐために、このライセンスを使用することにしました。

私たちは多くのオープンソースライブラリに依存し、独自のものを作成および配布しています。
依存関係の完全なリストは、[GitHub]({contacts.github})で確認できます。
</section>
