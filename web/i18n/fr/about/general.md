<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="summary"><SectionHeading title={$t("about.heading.summary")} sectionId="summary" />

FreeSaveVideo est un outil web permettant d'enregistrer le contenu public des plateformes compatibles : vidéos, fichiers audio, images et GIF. Il fonctionne dans les navigateurs mobiles et de bureau. Le site officiel peut afficher des publicités et utiliser les services d'analyse décrits dans la Politique de confidentialité.
</section>
<section id="privacy"><SectionHeading title={$t("about.heading.privacy")} sectionId="privacy" />

Les demandes de téléchargement sont envoyées au serveur pour analyse et transmission. Lorsqu'une fonction exige une connexion, la demande peut être associée au compte. Des informations sur la demande et l'état du traitement peuvent être enregistrées pour la sécurité, les points, la supervision et le dépannage. Le chiffrement des tunnels ne rend pas l'utilisateur anonyme vis-à-vis du serveur. Consultez la [Politique de confidentialité](privacy).
</section>
<section id="local"><SectionHeading title={$t("about.heading.local")} sectionId="local" />

Les outils indiqués comme locaux, tels que [remux](../../remux), traitent le fichier choisi dans le navigateur sans l'envoyer au serveur pour conversion. La page peut néanmoins se connecter aux services d'hébergement, d'authentification, d'analyse ou de publicité.
</section>
