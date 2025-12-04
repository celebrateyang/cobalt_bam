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

Großes Dankeschön an unsere Thing Breaker, die Updates früh testen und sicherstellen, dass sie stabil sind.
Sie haben uns auch geholfen, cobalt 10 auszuliefern!
<BetaTesters />

Alle Links sind extern und führen zu ihren persönlichen Websites oder sozialen Medien.
</section>

<section id="meowbalt">
<SectionHeading
    title={$t("general.meowbalt")}
    sectionId="meowbalt"
/>

meowbalt ist cobalts schnelles Maskottchen. Er ist eine äußerst ausdrucksstarke Katze, die schnelles Internet liebt.

Alle erstaunlichen Zeichnungen von meowbalt, die Sie in cobalt sehen, wurden von [GlitchyPSI](https://glitchypsi.xyz/) gemacht.
Er ist auch der ursprüngliche Designer der Figur.

Sie können GlitchyPSIs Kunstwerke von meowbalt nicht ohne seine ausdrückliche Genehmigung verwenden oder ändern.

Sie können das meowbalt-Charakterdesign nicht kommerziell oder in einer Form verwenden oder ändern, die keine Fankunst ist.
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

Der cobalt-Verarbeitungsserver ist Open Source und unter [AGPL-3.0]({docs.apiLicense}) lizenziert.

Das cobalt-Frontend ist [source first](https://sourcefirst.com/) und unter [CC-BY-NC-SA 4.0]({docs.webLicense}) lizenziert.
Wir haben uns für diese Lizenz entschieden, um Betrüger daran zu hindern, von unserer Arbeit zu profitieren
& bösartige Klone zu erstellen, die Menschen täuschen und unsere öffentliche Identität schädigen.

Wir verlassen uns auf viele Open-Source-Bibliotheken, erstellen und verteilen unsere eigenen.
Sie können die vollständige Liste der Abhängigkeiten auf [GitHub]({contacts.github}) sehen.
</section>
