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

un énorme merci à nos briseurs de trucs pour avoir testé les mises à jour en avant-première et s'être assurés qu'elles sont stables.
ils nous ont également aidés à livrer cobalt 10 !
<BetaTesters />

tous les liens sont externes et mènent à leurs sites web personnels ou réseaux sociaux.
</section>

<section id="meowbalt">
<SectionHeading
    title={$t("general.meowbalt")}
    sectionId="meowbalt"
/>

meowbalt est la mascotte rapide de cobalt. c'est un chat extrêmement expressif qui adore internet rapide.

tous les superbes dessins de meowbalt que vous voyez dans cobalt ont été réalisés par [GlitchyPSI](https://glitchypsi.xyz/).
il est également le concepteur original du personnage.

vous ne pouvez pas utiliser ou modifier les œuvres d'art de GlitchyPSI de meowbalt sans son autorisation explicite.

vous ne pouvez pas utiliser ou modifier le design du personnage meowbalt commercialement ou sous toute forme qui n'est pas du fan art.
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

le serveur de traitement cobalt est open source et sous licence [AGPL-3.0]({docs.apiLicense}).

l'interface cobalt est [source first](https://sourcefirst.com/) et sous licence [CC-BY-NC-SA 4.0]({docs.webLicense}).
nous avons décidé d'utiliser cette licence pour empêcher les escrocs de profiter de notre travail
et de créer des clones malveillants qui trompent les gens et nuisent à notre identité publique.

nous nous appuyons sur de nombreuses bibliothèques open source, créons et distribuons les nôtres.
vous pouvez voir la liste complète des dépendances sur [github]({contacts.github}).
</section>
