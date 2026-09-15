<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading title={$t("about.heading.general")} sectionId="general" />

이 약관은 공식 FreeSaveVideo 사이트에 적용됩니다. FreeSaveVideo는 사용자가 접근 권한을 가진 지원 플랫폼의 공개 콘텐츠를 저장하도록 돕는 도구입니다. 비공개, 유료, 회원 전용 또는 DRM으로 보호된 콘텐츠의 접근 통제를 우회하는 용도로 사용할 수 없습니다.
</section>

<section id="saving">
<SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

서버는 지원되는 공개 페이지를 분석하고, 필요한 경우 미디어 스트림을 병합하거나 브라우저로 전달합니다. 터널 전송 미디어는 실시간으로 처리되며 영구 미디어 보관소에 저장되지 않습니다. 요청, 계정 및 처리 상태 정보는 [개인정보 보호정책](privacy)에 따라 처리될 수 있습니다.
</section>

<section id="responsibility">
<SectionHeading title={$t("about.heading.responsibility")} sectionId="responsibility" />

사용자는 제출한 콘텐츠, 다운로드한 파일 및 그 사용이나 배포에 대한 책임이 있습니다. 자신이 소유하거나 저장할 허가가 있는 공개 콘텐츠만 이용하고, 원본 플랫폼의 약관과 관련 법률 및 권리자의 권리를 준수하세요.

FreeSaveVideo는 원본 콘텐츠를 소유하지 않으며, 원본 플랫폼의 제한으로 인해 화질, 형식 또는 제공 여부가 변경될 수 있습니다.
</section>

<section id="abuse">
<SectionHeading title={$t("about.heading.abuse")} sectionId="abuse" />

남용, 자동화된 과도한 요청, 접근 통제 우회 시도 또는 권리 침해 신고가 확인되면 요청, 계정 또는 특정 출처에 대한 접근을 제한하거나 중단할 수 있습니다.

문제 신고나 지원 요청은 [문의 페이지](contact)를 이용하세요.
</section>
