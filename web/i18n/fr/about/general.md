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

FreeSaveVideo vous aide à enregistrer du contenu public depuis vos sites favoris : vidéos, audio, photos ou GIFs. Collez le lien et commencez tout de suite.

Pas de publicités, de traqueurs ni de paywalls. Juste une application web pratique pour mobile et ordinateur.
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

Toutes les requêtes vers le backend sont anonymes et les informations de tunnel sont chiffrées.
Nous appliquons une politique stricte de zéro journal et ne suivons aucune personne individuellement.

Lorsqu’une requête nécessite un traitement supplémentaire, FreeSaveVideo traite les fichiers à la volée. Les parties traitées sont envoyées directement au client par tunnel et ne sont jamais enregistrées sur le disque.

Vous pouvez aussi [activer le tunnel forcé](../../settings/privacy#tunnel) pour protéger votre confidentialité.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

Les fonctions récentes, comme le [remuxing](../../remux), fonctionnent localement sur votre appareil.
Le traitement sur l’appareil est efficace et n’envoie aucun fichier local sur internet.
</section>

