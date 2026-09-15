<script lang="ts">
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

このポリシーは公式の FreeSaveVideo サイトにのみ適用されます。第三者が運営するインスタンスを利用する場合は、その運営者のポリシーをご確認ください。

FreeSaveVideo は、サービス提供、セキュリティ、不正利用の防止、アカウントとポイントの管理、問題調査に必要な情報を処理します。主な内容を以下に説明します。
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

ブラウザ内での変換や音声抽出など、端末上で処理すると明記された機能は、対応ブラウザでは端末内でファイルを処理します。ただしページ自体は、このポリシーに記載するホスティング、認証、アクセス解析、広告サービスと通信する場合があります。
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

ダウンロード要求を送信すると、要求 ID、日時、関連するアカウントまたはメールアドレス、プラットフォーム、処理状態、エラー情報などが処理・記録される場合があります。これらはダウンロード状況の確認、ポイント計算、不正利用の防止、問題調査に使用されます。現在のダウンロード試行記録には、標準で 2 日後に削除する処理があります。アカウント、決済、利用権、または利用者が保存を選択した機能データは、それぞれの目的に応じてより長く保持される場合があります。

FreeSaveVideo は、サーバー経由でファイルを転送するための一時データを生成する場合があります。トンネルを開くためのデータは限られた時間だけサーバーのメモリに置かれ、通常のダウンロード処理で転送されるメディアを恒久的なファイルとしてディスクへ保存しません。
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

一時的なトンネルデータは AES-256 で暗号化され、要求ごとに個別の鍵が生成されます。復号鍵はファイルへアクセスするためのリンクを通じて渡されるため、ダウンロードリンクを無関係な第三者と共有しないでください。
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

Plausible が有効な場合、サイトは利用状況を把握するため集計されたアクセス情報を使用します。この解析は<a href="../../settings/privacy#analytics">プライバシー設定</a>から無効にできます。

[Plausible のプライバシー方針を見る](https://plausible.io/privacy-focused-web-analytics)
</section>
{/if}

<section id="third-party">
<SectionHeading
    title="第三者のアクセス解析と広告"
    sectionId="third-party"
/>

公式サイトでは、利用状況の分析、キャンペーン測定、広告表示のために Microsoft Clarity、Meta Pixel、Google Analytics、Google AdSense を読み込む場合があります。各サービスは、ブラウザ設定と各社のポリシーに従い、おおよその IP アドレス、端末、ブラウザ、閲覧ページ、識別子、Cookie などの技術情報を受け取る場合があります。ページ上の解析コードから、ダウンロード要求の内容を広告サービスへ意図的に送信することはありません。

これらはブラウザのプライバシー設定、トラッキング防止、Cookie 管理で制限できます。一部スクリプトの遮断は測定や広告表示に影響することがありますが、ダウンロード対象に対する利用者の権利を変更するものではありません。
</section>

<section id="account">
<SectionHeading
    title="アカウントと決済"
    sectionId="account"
/>

公式サイトは登録、ログイン、アカウントセッションに Clerk を使用します。決済情報は購入画面に表示される決済事業者が処理する場合があります。FreeSaveVideo はポイント付与、会員資格の有効化、支払い確認、購入後のサポートに必要な取引情報と利用権情報を保持しますが、決済事業者のフォームへ入力された完全なカード番号を受け取りません。
</section>

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

ページのホスティング、コンテンツ配信、DDoS・ボット対策に Cloudflare を使用しています。そのため Cloudflare は、安全なページ配信に必要なネットワーク情報と要求情報を処理する場合があります。

[Cloudflare のプライバシーとデータ保護について](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
