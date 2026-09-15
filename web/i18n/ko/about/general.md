<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="summary">
<SectionHeading title={$t("about.heading.summary")} sectionId="summary" />

FreeSaveVideo는 지원 플랫폼의 공개 콘텐츠를 저장하는 웹 도구입니다. 동영상, 오디오, 이미지 또는 GIF가 포함된 공개 페이지 링크를 붙여넣으면 모바일과 컴퓨터의 브라우저에서 사용할 수 있는 결과를 확인할 수 있습니다.

공식 사이트에는 서비스 운영을 위한 광고가 표시될 수 있으며, 개인정보 보호정책에 설명된 분석 도구를 사용할 수 있습니다.
</section>

<section id="privacy">
<SectionHeading title={$t("about.heading.privacy")} sectionId="privacy" />

다운로드 요청은 분석과 파일 전달을 위해 백엔드로 전송됩니다. 로그인이 필요한 기능을 사용하면 요청이 계정과 연결될 수 있습니다. 보안, 포인트 정산, 서비스 모니터링과 문제 해결에 필요한 요청 및 처리 상태 정보가 기록될 수 있습니다.

미디어는 실시간으로 처리됩니다. 터널 전송에 사용되는 암호화와 고유 키는 링크의 추측 또는 변조 위험을 줄이지만, 서버에 대한 익명성을 보장하지는 않습니다. [강제 터널링](../../settings/privacy#tunnel)을 사용하면 지원되는 다운로드가 서버 터널을 통해 전달됩니다.

자세한 보관 기간과 제3자 서비스는 [개인정보 보호정책](privacy)을 확인하세요.
</section>

<section id="local">
<SectionHeading title={$t("about.heading.local")} sectionId="local" />

[리먹싱](../../remux)과 같이 기기 내 처리로 표시된 도구는 선택한 파일을 브라우저에서 처리하며, 해당 로컬 파일을 변환을 위해 서버에 업로드하지 않습니다. 다만 페이지 자체는 호스팅, 인증, 분석 또는 광고 서비스를 위해 네트워크에 연결될 수 있습니다.
</section>
