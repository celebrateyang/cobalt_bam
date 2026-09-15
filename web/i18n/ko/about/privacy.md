<script lang="ts">
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading title={$t("about.heading.general")} sectionId="general" />

이 정책은 공식 FreeSaveVideo 사이트에 적용됩니다. 서비스 제공, 계정 및 포인트 기능, 보안, 남용 방지, 모니터링과 문제 해결에 필요한 데이터를 처리합니다. 다른 운영자가 제공하는 인스턴스에는 해당 운영자의 정책이 적용됩니다.
</section>

<section id="local">
<SectionHeading title={$t("about.heading.local")} sectionId="local" />

기기 내 처리로 표시된 도구는 선택한 파일을 브라우저에서 처리하고 변환을 위해 서버에 업로드하지 않습니다. 페이지는 호스팅, 인증, 분석 또는 광고 서비스를 제공하기 위해 네트워크에 연결될 수 있습니다.
</section>

<section id="saving">
<SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

서비스는 요청 ID, 시간, 로그인 계정 또는 이메일, 대상 플랫폼, 처리 상태와 오류 정보를 기록할 수 있습니다. 이 정보는 서비스 모니터링, 포인트 정산, 남용 방지와 문제 해결에 사용됩니다. 현재 다운로드 시도 기록은 기본적으로 2일 후 정리됩니다. 계정, 결제, 접근 기록과 사용자가 저장한 기능 데이터는 서비스 및 법적 의무에 필요한 기간 동안 더 오래 보관될 수 있습니다.

터널이 필요한 다운로드의 미디어 데이터는 전송 중 일시적으로 처리되며 영구 미디어 보관소로 사용되지 않습니다.
</section>

<section id="encryption">
<SectionHeading title={$t("about.heading.encryption")} sectionId="encryption" />

일시적인 터널 데이터는 AES-256 방식으로 보호되며 각 터널에는 고유 키가 사용됩니다. 터널 링크를 받은 사람은 파일에 접근할 수 있으므로 링크를 공개하거나 신뢰할 수 없는 사람과 공유하지 마세요.
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading title={$t("about.heading.plausible")} sectionId="plausible" />

활성화된 경우 Plausible을 사용하여 페이지 방문과 기능 사용에 관한 집계 통계를 확인합니다. 사용 가능한 선택 사항은 <a href="../settings/privacy#analytics">개인정보 설정</a>에서 확인할 수 있습니다.
</section>
{/if}

<section id="third-party">
<SectionHeading title="분석 및 광고 서비스" sectionId="third-party" />

공식 사이트는 설정에 따라 Microsoft Clarity, Meta Pixel, Google Analytics 또는 Google AdSense와 같은 제3자 서비스를 사용할 수 있습니다. 이러한 제공자는 대략적인 IP 위치, 기기 및 브라우저 정보, 방문 페이지, 쿠키 또는 광고 식별자를 처리할 수 있습니다. 페이지 분석 코드는 다운로드 요청의 내용을 분석 이벤트로 의도적으로 전송하지 않습니다.
</section>

<section id="account">
<SectionHeading title="계정 및 결제" sectionId="account" />

로그인과 계정 관리는 Clerk를 통해 제공될 수 있습니다. 유료 포인트를 구매하면 결제 제공자가 결제 정보를 처리하며, FreeSaveVideo는 주문, 거래 상태와 이용 권한 기록을 보관할 수 있습니다. 전체 카드 번호는 FreeSaveVideo가 직접 저장하지 않습니다.
</section>

<section id="cloudflare">
<SectionHeading title={$t("about.heading.cloudflare")} sectionId="cloudflare" />

Cloudflare Pages 및 Cloudflare의 보안·전송 서비스를 사용하여 사이트를 제공하고 DDoS 또는 자동화된 남용을 완화합니다. Cloudflare는 이 과정에서 연결 및 보안 정보를 처리할 수 있습니다. 자세한 내용은 [Cloudflare의 개인정보 보호정책](https://www.cloudflare.com/privacypolicy/)을 확인하세요.
</section>
