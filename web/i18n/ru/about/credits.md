<script lang="ts">
    import { contacts, docs } from "$lib/env";
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
    import BetaTesters from "$components/misc/BetaTesters.svelte";
</script>

<section id="testers">
<SectionHeading title={$t("about.heading.testers")} sectionId="testers" />

Благодарим тестировщиков, которые заранее проверяют обновления и помогают обеспечивать стабильность.
<BetaTesters />

Ссылки ведут на внешние личные сайты или страницы в социальных сетях.
</section>

<section id="meowbalt">
<SectionHeading title={$t("general.meowbalt")} sectionId="meowbalt" />

Meowbalt — быстрый и выразительный кот-талисман FreeSaveVideo. Иллюстрации и первоначальный дизайн персонажа созданы [GlitchyPSI](https://glitchypsi.xyz/). Использование или изменение этих работ требует явного разрешения автора; коммерческое использование дизайна персонажа также запрещено вне рамок разрешённого фан-арта.
</section>

<section id="licenses">
<SectionHeading title={$t("about.heading.licenses")} sectionId="licenses" />

Сервер обработки FreeSaveVideo имеет открытый исходный код и лицензию [AGPL-3.0]({docs.apiLicense}). Интерфейс FreeSaveVideo следует принципу [source first](https://sourcefirst.com/) и распространяется по лицензии [CC-BY-NC-SA 4.0]({docs.webLicense}). Полный список зависимостей доступен на [GitHub]({contacts.github}).
</section>
