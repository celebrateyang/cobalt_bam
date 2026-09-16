<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="general"><SectionHeading title={$t("about.heading.general")} sectionId="general" />

Ces conditions s'appliquent au site officiel FreeSaveVideo. L'outil aide à enregistrer le contenu public de plateformes compatibles lorsque l'utilisateur est autorisé à le faire. Il ne doit pas servir à contourner les contrôles d'accès visant un contenu privé, payant, réservé aux membres ou protégé par DRM.
</section>
<section id="saving"><SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

Le serveur analyse les pages publiques compatibles et, si nécessaire, assemble ou transmet les flux multimédias au navigateur. Les informations de requête, de compte et d'état sont traitées conformément à la [Politique de confidentialité](privacy).
</section>
<section id="responsibility"><SectionHeading title={$t("about.heading.responsibility")} sectionId="responsibility" />

L'utilisateur est responsable du contenu soumis, des fichiers téléchargés et de leur utilisation ou distribution. Utilisez uniquement un contenu public que vous possédez, que vous êtes autorisé à enregistrer ou que la loi vous permet d'enregistrer. Respectez les conditions de la plateforme source et les droits des tiers.
</section>
<section id="abuse"><SectionHeading title={$t("about.heading.abuse")} sectionId="abuse" />

Nous pouvons limiter ou suspendre des demandes, comptes ou sources en cas d'abus, de requêtes automatisées excessives, de tentative de contournement ou de signalement valable d'une atteinte aux droits. Utilisez la [page de contact](contact) pour obtenir de l'aide.
</section>
