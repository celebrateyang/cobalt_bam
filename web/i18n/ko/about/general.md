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

FreeSaveVideo는 좋아하는 웹사이트의 공개 콘텐츠를 저장할 수 있는 도구입니다. 동영상, 오디오, 사진, GIF 링크를 붙여넣기만 하면 바로 사용할 수 있습니다.

광고, 트래커, 페이월이 없는 간편한 Web 앱입니다.
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

백엔드로 보내는 모든 요청은 익명이며, 터널 정보는 암호화됩니다.
우리는 제로 로그 정책을 지키며 개인을 추적하지 않습니다.

추가 처리가 필요한 경우 FreeSaveVideo는 파일을 실시간으로 처리합니다.

[강제 터널링](../../settings/privacy#tunnel)을 켜면 모든 다운로드 파일이 터널을 통해 전송됩니다.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

[remuxing](../../remux)과 같은 최신 기능은 기기에서 로컬로 실행됩니다.
로컬 파일을 인터넷으로 보내지 않습니다.
</section>

