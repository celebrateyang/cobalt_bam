<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

이 약관은 공식 freesavevideo 인스턴스를 사용할 때만 적용됩니다.
다른 경우에는 정확한 정보를 위해 호스터에게 연락해야 할 수 있습니다.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

저장 기능은 인터넷에서 콘텐츠를 다운로드하는 것을 단순화하며 저장된 콘텐츠가 무엇에 사용되는지에 대해 어떠한 책임도 지지 않습니다.
처리 서버는 고급 프록시처럼 작동하며 콘텐츠를 디스크에 쓰지 않습니다.
모든 것은 RAM에서 처리되며 터널이 완료되면 영구적으로 삭제됩니다.
우리는 다운로드 로그가 없으며 누구도 식별할 수 없습니다.

[개인정보 보호정책에서 터널 작동 방식에 대해 자세히 읽을 수 있습니다.](privacy)
</section>

<section id="responsibility">
<SectionHeading
    title={$t("about.heading.responsibility")}
    sectionId="responsibility"
/>

귀하(최종 사용자)는 우리의 도구로 무엇을 하는지, 결과 콘텐츠를 어떻게 사용하고 배포하는지에 대해 책임이 있습니다.
다른 사람의 콘텐츠를 사용할 때 신중하게 생각하고 항상 원본 제작자에게 크레딧을 제공하세요.
어떤 약관이나 라이선스도 위반하지 않도록 하세요.

교육 목적으로 사용할 때는 항상 출처를 인용하고 원본 제작자에게 크레딧을 제공하세요.

공정한 사용과 크레딧은 모든 사람에게 이익이 됩니다.
</section>

<section id="abuse">
<SectionHeading
    title={$t("about.heading.abuse")}
    sectionId="abuse"
/>

freesavevideo는 100% 익명이므로 악용 행위를 자동으로 감지할 방법이 없습니다.


이 이메일은 사용자 지원을 위한 것이 아닙니다.
문제가 발생하면 [지원 페이지](community)의 선호하는 방법을 통해 문의하세요.
</section>
