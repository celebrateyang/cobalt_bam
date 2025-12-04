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

bamboo download vous aide à enregistrer tout ce que vous aimez depuis vos sites web préférés : vidéo, audio, photos ou gifs. collez simplement le lien et c'est parti !

pas de publicités, de trackers, de paywalls ou d'autres absurdités. juste une application web pratique qui fonctionne partout, quand vous en avez besoin.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

toutes les requêtes vers le backend sont anonymes et toutes les informations sur les tunnels sont chiffrées.
nous avons une politique stricte de zéro journal et ne suivons *rien* concernant les individus.

lorsqu'une requête nécessite un traitement supplémentaire, bamboo download traite les fichiers à la volée.
cela se fait en tunnelisant les parties traitées directement au client, sans jamais rien enregistrer sur le disque.
par exemple, cette méthode est utilisée lorsque le service source fournit les canaux vidéo et audio sous forme de fichiers séparés.

de plus, vous pouvez [activer la tunnelisation forcée](../settings/privacy#tunnel) pour protéger votre confidentialité.
lorsqu'elle est activée, bamboo download tunnelisera tous les fichiers téléchargés.
personne ne saura d'où vous téléchargez quelque chose, même pas votre fournisseur d'accès.
tout ce qu'ils verront, c'est que vous utilisez une instance bamboo download.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

les nouvelles fonctionnalités, telles que le [remuxage](/remux), fonctionnent localement sur votre appareil.
le traitement sur l'appareil est efficace et n'envoie jamais rien sur internet.
cela s'aligne parfaitement avec notre objectif futur de déplacer autant de traitement que possible vers le client.
</section>
