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

bamboo download는 좋아하는 웹사이트에서 동영상, 오디오, 사진 또는 GIF 등 모든 것을 저장할 수 있도록 도와줍니다. 링크를 붙여넣기만 하면 시작할 준비가 됩니다!

광고, 추적기, 유료 장벽 또는 기타 말도 안 되는 것이 없습니다. 언제든지 필요할 때마다 어디서나 작동하는 편리한 웹 앱일 뿐입니다.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

백엔드에 대한 모든 요청은 익명이며 터널에 대한 모든 정보는 암호화됩니다.
우리는 엄격한 제로 로그 정책을 가지고 있으며 개인에 대한 *어떤 것도* 추적하지 않습니다.

요청이 추가 처리가 필요한 경우 bamboo download는 파일을 즉석에서 처리합니다.
디스크에 아무것도 저장하지 않고 처리된 부분을 클라이언트에 직접 터널링하여 수행됩니다.
예를 들어, 이 방법은 소스 서비스가 비디오와 오디오 채널을 별도의 파일로 제공할 때 사용됩니다.

또한 [강제 터널링을 활성화](../settings/privacy#tunnel)하여 개인정보를 보호할 수 있습니다.
활성화하면 bamboo download가 다운로드한 모든 파일을 터널링합니다.
네트워크 제공업체조차도 어디서 무언가를 다운로드하는지 알 수 없습니다.
그들이 볼 수 있는 것은 bamboo download 인스턴스를 사용하고 있다는 것뿐입니다.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

[리먹싱](/remux)과 같은 최신 기능은 기기에서 로컬로 작동합니다.
기기 내 처리는 효율적이며 인터넷을 통해 아무것도 전송하지 않습니다.
가능한 한 많은 처리를 클라이언트로 이동하려는 우리의 미래 목표와 완벽하게 일치합니다.
</section>
