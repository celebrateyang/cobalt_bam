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

bamboo_downloadのプライバシーポリシーはシンプルです：私たちはあなたについて何も収集または保存しません。あなたがすることは、私たちや他の誰かのビジネスではなく、あなただけのビジネスです。

これらの条件は、公式のbamboo_downloadインスタンスを使用する場合にのみ適用されます。それ以外の場合は、正確な情報についてホスティング事業者に連絡する必要がある場合があります。
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

デバイス上の処理を使用するツールは、オフラインでローカルに動作し、どこにもデータを送信しません。これらは、該当する場合は明示的にそのようにマークされています。
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

保存機能を使用する場合、bamboo_downloadはトンネリングに必要な情報を暗号化し、一時的に保存します。これは処理サーバーのRAMに90秒間保存され、その後不可逆的に削除されます。公式のbamboo_downloadイメージを変更しない限り、インスタンスの所有者でさえアクセスできません。

処理/トンネルされたファイルはどこにもキャッシュされません。すべてがライブでトンネルされます。bamboo_downloadの保存機能は、本質的に高度なプロキシサービスです。
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

一時的に保存されるトンネルデータは、AES-256標準を使用して暗号化されます。復号化キーはアクセスリンクにのみ含まれており、ログ/キャッシュ/保存されることはありません。エンドユーザーのみがリンクと暗号化キーにアクセスできます。キーは、リクエストされた各トンネルに対して一意に生成されます。
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

プライバシーのために、私たちは[plausibleの匿名トラフィック分析](https://plausible.io/)を使用して、アクティブなbamboo_downloadユーザーのおおよその数を取得しています。あなたやあなたのリクエストについての識別可能な情報は保存されません。すべてのデータは匿名化され、集約されます。私たちが使用しているplausibleインスタンスは、私たち自身がホストおよび管理しています。

plausibleはクッキーを使用せず、GDPR、CCPA、PECRに完全に準拠しています。

[plausibleのプライバシーへの献身について詳しく学ぶ。](https://plausible.io/privacy-focused-web-analytics)

匿名分析をオプトアウトしたい場合は、<a href="../settings/privacy#analytics">プライバシー設定</a>で行うことができます。
</section>
{/if}

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

私たちはDDoSとボット保護のためにCloudflareサービスを使用しています。また、静的WebアプリをデプロイおよびホスティングするためにCloudflare Pagesを使用しています。これらはすべて、すべての人に最高のエクスペリエンスを提供するために必要です。私たちが知っている中で最もプライベートで信頼性の高いプロバイダーです。

CloudflareはGDPRおよびHIPAAに完全に準拠しています。

[Cloudflareのプライバシーへの献身について詳しく学ぶ。](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
