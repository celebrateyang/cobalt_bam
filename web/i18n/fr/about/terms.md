<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

ces conditions ne sont applicables que lors de l'utilisation de l'instance officielle freesavevideo.
dans d'autres cas, vous devrez peut-être contacter l'hébergeur pour obtenir des informations précises.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

la fonctionnalité d'enregistrement simplifie le téléchargement de contenu depuis internet et n'assume aucune responsabilité quant à l'utilisation du contenu enregistré.
les serveurs de traitement fonctionnent comme des proxys avancés et n'écrivent jamais aucun contenu sur le disque.
tout est géré en RAM et purgé définitivement une fois le tunnel terminé.
nous n'avons pas de journaux de téléchargement et ne pouvons identifier personne.

[vous pouvez en savoir plus sur le fonctionnement des tunnels dans notre politique de confidentialité.](privacy)
</section>

<section id="responsibility">
<SectionHeading
    title={$t("about.heading.responsibility")}
    sectionId="responsibility"
/>

vous (utilisateur final) êtes responsable de ce que vous faites avec nos outils, de la façon dont vous utilisez et distribuez le contenu résultant.
veuillez être attentif lors de l'utilisation du contenu d'autrui et créditez toujours les créateurs originaux.
assurez-vous de ne violer aucune condition ou licence.

lors d'une utilisation à des fins éducatives, citez toujours les sources et créditez les créateurs originaux.

l'usage équitable et les crédits profitent à tous.
</section>

<section id="abuse">
<SectionHeading
    title={$t("about.heading.abuse")}
    sectionId="abuse"
/>

nous n'avons aucun moyen de détecter automatiquement les comportements abusifs, car freesavevideo est 100% anonyme.


veuillez noter que cet email n'est pas destiné à l'assistance utilisateur.
si vous rencontrez des problèmes, contactez-nous via n'importe quelle méthode préférée sur [la page d'assistance](community).
</section>
