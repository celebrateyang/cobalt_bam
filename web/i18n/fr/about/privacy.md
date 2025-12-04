<script lang="ts">
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

la politique de confidentialité de bamboo_download est simple : nous ne collectons ni ne stockons rien à votre sujet. ce que vous faites relève uniquement de votre responsabilité, pas de la nôtre ni de celle de quiconque.

ces conditions ne sont applicables que lors de l'utilisation de l'instance officielle bamboo_download. dans d'autres cas, vous devrez peut-être contacter l'hébergeur pour obtenir des informations précises.
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

les outils qui utilisent le traitement sur l'appareil fonctionnent hors ligne, localement, et n'envoient jamais de données nulle part. ils sont explicitement marqués comme tels lorsque cela est applicable.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

lors de l'utilisation de la fonctionnalité d'enregistrement, dans certains cas, bamboo_download chiffrera et stockera temporairement les informations nécessaires à la tunnelisation. elles sont stockées dans la RAM du serveur de traitement pendant 90 secondes et purgées irréversiblement par la suite. personne n'y a accès, même les propriétaires d'instance, tant qu'ils ne modifient pas l'image officielle bamboo_download.

les fichiers traités/tunnelisés ne sont jamais mis en cache nulle part. tout est tunnelisé en direct. la fonctionnalité d'enregistrement de bamboo_download est essentiellement un service proxy sophistiqué.
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

les données de tunnel temporairement stockées sont chiffrées à l'aide de la norme AES-256. les clés de déchiffrement ne sont incluses que dans le lien d'accès et ne sont jamais enregistrées/mises en cache/stockées nulle part. seul l'utilisateur final a accès au lien et aux clés de chiffrement. les clés sont générées de manière unique pour chaque tunnel demandé.
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

par souci de confidentialité, nous utilisons [les analyses de trafic anonymes de plausible](https://plausible.io/) pour obtenir un nombre approximatif d'utilisateurs actifs de bamboo_download. aucune information identifiable sur vous ou vos demandes n'est jamais stockée. toutes les données sont anonymisées et agrégées. l'instance plausible que nous utilisons est hébergée et gérée par nous.

plausible n'utilise pas de cookies et est entièrement conforme au RGPD, CCPA et PECR.

[en savoir plus sur l'engagement de plausible envers la confidentialité.](https://plausible.io/privacy-focused-web-analytics)

si vous souhaitez vous désinscrire des analyses anonymes, vous pouvez le faire dans <a href="../settings/privacy#analytics">les paramètres de confidentialité</a>.
</section>
{/if}

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

nous utilisons les services cloudflare pour la protection DDoS et anti-robots. nous utilisons également cloudflare pages pour déployer et héberger l'application web statique. tout cela est nécessaire pour offrir la meilleure expérience à tous. c'est le fournisseur le plus privé et fiable que nous connaissions.

cloudflare est entièrement conforme au RGPD et HIPAA.

[en savoir plus sur l'engagement de cloudflare envers la confidentialité.](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
