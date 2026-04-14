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

FreeSaveVideo vous aide 脿 enregistrer tout ce que vous aimez depuis vos sites web pr茅f茅r茅s : vid茅o, audio, photos ou gifs. collez simplement le lien et c'est parti !

pas de publicit茅s, de trackers, de paywalls ou d'autres absurdit茅s. juste une application web pratique qui fonctionne partout, quand vous en avez besoin.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

toutes les requ锚tes vers le backend sont anonymes et toutes les informations sur les tunnels sont chiffr茅es.
nous avons une politique stricte de z茅ro journal et ne suivons *rien* concernant les individus.

lorsqu'une requ锚te n茅cessite un traitement suppl茅mentaire, FreeSaveVideo traite les fichiers 脿 la vol茅e.
cela se fait en tunnelisant les parties trait茅es directement au client, sans jamais rien enregistrer sur le disque.
par exemple, cette m茅thode est utilis茅e lorsque le service source fournit les canaux vid茅o et audio sous forme de fichiers s茅par茅s.

de plus, vous pouvez [activer la tunnelisation forc茅e](../../settings/privacy#tunnel) pour prot茅ger votre confidentialit茅.
lorsqu'elle est activ茅e, FreeSaveVideo tunnelisera tous les fichiers t茅l茅charg茅s.
personne ne saura d'o霉 vous t茅l茅chargez quelque chose, m锚me pas votre fournisseur d'acc猫s.
tout ce qu'ils verront, c'est que vous utilisez une instance FreeSaveVideo.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

les nouvelles fonctionnalit茅s, telles que le [remuxage](../../remux), fonctionnent localement sur votre appareil.
le traitement sur l'appareil est efficace et n'envoie jamais rien sur internet.
cela s'aligne parfaitement avec notre objectif futur de d茅placer autant de traitement que possible vers le client.
</section>

