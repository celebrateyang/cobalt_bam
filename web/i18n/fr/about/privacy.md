<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="general"><SectionHeading title={$t("about.heading.general")} sectionId="general" />

Cette politique s'applique au site officiel FreeSaveVideo. Nous traitons les données nécessaires à la fourniture du service, aux comptes et points, à la sécurité, à la prévention des abus, à la supervision et au dépannage.
</section>
<section id="saving"><SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

Nous pouvons enregistrer l'identifiant et l'heure de la requête, le compte ou l'adresse e-mail, la plateforme, l'état du traitement et les erreurs. Ces informations servent à la supervision, aux points, à la prévention des abus et à l'assistance. Les enregistrements actuels des tentatives de téléchargement sont supprimés par défaut après deux jours. Les données de compte, de paiement, d'accès et de fonctions enregistrées par l'utilisateur peuvent être conservées plus longtemps lorsque le service ou la loi l'exige.

Les données multimédias nécessitant un tunnel sont traitées temporairement pendant le transfert et ne constituent pas un stockage multimédia permanent.
</section>
<section id="encryption"><SectionHeading title={$t("about.heading.encryption")} sectionId="encryption" />

Les données temporaires du tunnel sont protégées par AES-256 et chaque tunnel utilise une clé unique. Toute personne recevant le lien du tunnel peut accéder au fichier ; ne le publiez pas et ne le partagez pas avec une personne non fiable.
</section>
<section id="third-party"><SectionHeading title="Analyse, publicité et prestataires" sectionId="third-party" />

Selon la configuration, le site peut utiliser Plausible, Microsoft Clarity, Meta Pixel, Google Analytics ou Google AdSense. Ces prestataires peuvent traiter une localisation IP approximative, des informations sur l'appareil et le navigateur, les pages visitées, des cookies ou des identifiants publicitaires. L'analyse des pages n'envoie pas intentionnellement le contenu de la demande de téléchargement comme événement analytique.

Clerk peut gérer la connexion. Les prestataires de paiement traitent les données de paiement ; FreeSaveVideo peut conserver les commandes, états de transaction et droits d'accès, mais ne stocke pas directement le numéro complet de la carte. Cloudflare fournit l'hébergement, la distribution et la sécurité et peut traiter des données de connexion et de sécurité.
</section>
