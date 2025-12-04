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

업데이트를 조기에 테스트하고 안정성을 확인해준 우리의 버그 헌터들에게 큰 감사를 표합니다.
그들은 또한 cobalt 10 출시를 도왔습니다!
<BetaTesters />

모든 링크는 외부 링크이며 개인 웹사이트나 소셜 미디어로 연결됩니다.
</section>

<section id="meowbalt">
<SectionHeading
    title={$t("general.meowbalt")}
    sectionId="meowbalt"
/>

meowbalt는 cobalt의 빠른 마스코트입니다. 그는 빠른 인터넷을 사랑하는 매우 표현력이 풍부한 고양이입니다.

cobalt에서 볼 수 있는 meowbalt의 모든 멋진 그림은 [GlitchyPSI](https://glitchypsi.xyz/)가 만들었습니다.
그는 또한 캐릭터의 원래 디자이너입니다.

GlitchyPSI의 명시적인 허가 없이는 meowbalt의 작품을 사용하거나 수정할 수 없습니다.

팬 아트가 아닌 형태로 상업적으로 또는 어떤 형태로든 meowbalt 캐릭터 디자인을 사용하거나 수정할 수 없습니다.
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

cobalt 처리 서버는 오픈 소스이며 [AGPL-3.0]({docs.apiLicense})에 따라 라이선스가 부여됩니다.

cobalt 프론트엔드는 [소스 우선](https://sourcefirst.com/)이며 [CC-BY-NC-SA 4.0]({docs.webLicense})에 따라 라이선스가 부여됩니다.
우리는 사기꾼들이 우리의 작업으로 이익을 얻는 것을 막고 사람들을 속이고 우리의 공개 정체성을 해치는 악의적인 복제본을 만드는 것을 막기 위해 이 라이선스를 사용하기로 결정했습니다.

우리는 많은 오픈 소스 라이브러리에 의존하고 우리 자신의 것을 만들어 배포합니다.
[GitHub]({contacts.github})에서 전체 종속성 목록을 볼 수 있습니다.
</section>
