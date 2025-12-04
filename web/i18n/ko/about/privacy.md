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

bamboo_download의 개인정보 보호정책은 간단합니다: 우리는 귀하에 대한 어떤 것도 수집하거나 저장하지 않습니다. 귀하가 무엇을 하는지는 오로지 귀하의 일이지 우리나 다른 사람의 일이 아닙니다.

이 약관은 공식 bamboo_download 인스턴스를 사용할 때만 적용됩니다. 다른 경우에는 정확한 정보를 위해 호스터에게 연락해야 할 수 있습니다.
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

기기 내 처리를 사용하는 도구는 오프라인, 로컬에서 작동하며 어디에도 데이터를 전송하지 않습니다. 해당되는 경우 명시적으로 표시됩니다.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

저장 기능을 사용할 때 경우에 따라 bamboo_download가 터널링에 필요한 정보를 암호화하고 일시적으로 저장합니다. 처리 서버의 RAM에 90초 동안 저장되며 그 후 돌이킬 수 없이 삭제됩니다. 공식 bamboo_download 이미지를 수정하지 않는 한 인스턴스 소유자조차도 액세스할 수 없습니다.

처리/터널링된 파일은 어디에도 캐시되지 않습니다. 모든 것이 라이브로 터널링됩니다. bamboo_download의 저장 기능은 본질적으로 멋진 프록시 서비스입니다.
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

일시적으로 저장된 터널 데이터는 AES-256 표준을 사용하여 암호화됩니다. 복호화 키는 액세스 링크에만 포함되며 어디에도 기록/캐시/저장되지 않습니다. 최종 사용자만 링크 및 암호화 키에 액세스할 수 있습니다. 키는 요청된 각 터널에 대해 고유하게 생성됩니다.
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

개인정보 보호를 위해 [plausible의 익명 트래픽 분석](https://plausible.io/)을 사용하여 활성 bamboo_download 사용자의 대략적인 수를 얻습니다. 귀하 또는 귀하의 요청에 대한 식별 가능한 정보는 절대 저장되지 않습니다. 모든 데이터는 익명화되고 집계됩니다. 우리가 사용하는 plausible 인스턴스는 우리가 호스팅하고 관리합니다.

plausible은 쿠키를 사용하지 않으며 GDPR, CCPA 및 PECR을 완전히 준수합니다.

[개인정보 보호에 대한 plausible의 헌신에 대해 자세히 알아보세요.](https://plausible.io/privacy-focused-web-analytics)

익명 분석을 거부하려면 <a href="../settings/privacy#analytics">개인정보 보호 설정</a>에서 할 수 있습니다.
</section>
{/if}

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

우리는 DDoS 및 봇 보호를 위해 cloudflare 서비스를 사용합니다. 또한 정적 웹 앱을 배포하고 호스팅하기 위해 cloudflare pages를 사용합니다. 이 모든 것은 모든 사람에게 최고의 경험을 제공하는 데 필요합니다. 우리가 아는 한 가장 비공개적이고 안정적인 제공업체입니다.

cloudflare는 GDPR 및 HIPAA를 완전히 준수합니다.

[개인정보 보호에 대한 cloudflare의 헌신에 대해 자세히 알아보세요.](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
