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

Die Datenschutzrichtlinie von bamboo_download ist einfach: Wir sammeln oder speichern nichts über Sie. Was Sie tun, ist ausschließlich Ihre Angelegenheit, nicht unsere oder die von jemand anderem.

Diese Bedingungen gelten nur bei Verwendung der offiziellen bamboo_download-Instanz. In anderen Fällen müssen Sie möglicherweise den Hoster für genaue Informationen kontaktieren.
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

Tools, die geräteinterne Verarbeitung verwenden, funktionieren offline, lokal und senden niemals Daten irgendwohin. Sie sind ausdrücklich als solche gekennzeichnet, wann immer dies zutrifft.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

Bei Verwendung der Speicherfunktion wird bamboo_download in einigen Fällen Informationen verschlüsseln und vorübergehend speichern, die für das Tunneling benötigt werden. Sie werden für 90 Sekunden im RAM des Verarbeitungsservers gespeichert und danach unwiderruflich gelöscht. Niemand hat Zugriff darauf, nicht einmal Instanzbesitzer, solange sie das offizielle bamboo_download-Image nicht ändern.

Verarbeitete/getunnelte Dateien werden niemals zwischengespeichert. Alles wird live getunnelt. Die Speicherfunktion von bamboo_download ist im Wesentlichen ein ausgefallener Proxy-Dienst.
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

Vorübergehend gespeicherte Tunneldaten werden mit dem AES-256-Standard verschlüsselt. Entschlüsselungsschlüssel sind nur im Zugriffslink enthalten und werden niemals protokolliert/zwischengespeichert/gespeichert. Nur der Endbenutzer hat Zugriff auf den Link und die Verschlüsselungsschlüssel. Schlüssel werden für jeden angeforderten Tunnel eindeutig generiert.
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

Aus Datenschutzgründen verwenden wir [Plausibles anonyme Traffic-Analyse](https://plausible.io/), um eine ungefähre Anzahl aktiver bamboo_download-Benutzer zu erhalten. Es werden keine identifizierbaren Informationen über Sie oder Ihre Anfragen gespeichert. Alle Daten werden anonymisiert und aggregiert. Die von uns verwendete Plausible-Instanz wird von uns gehostet und verwaltet.

Plausible verwendet keine Cookies und ist vollständig GDPR-, CCPA- und PECR-konform.

[Erfahren Sie mehr über Plausibles Engagement für Datenschutz.](https://plausible.io/privacy-focused-web-analytics)

Wenn Sie sich von anonymen Analysen abmelden möchten, können Sie dies in den <a href="../settings/privacy#analytics">Datenschutzeinstellungen</a> tun.
</section>
{/if}

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

Wir verwenden Cloudflare-Dienste für DDoS- und Bot-Schutz. Wir verwenden auch Cloudflare Pages für die Bereitstellung und das Hosting der statischen Web-App. All dies ist erforderlich, um die beste Erfahrung für alle zu bieten. Es ist der privateste und zuverlässigste Anbieter, den wir kennen.

Cloudflare ist vollständig GDPR- und HIPAA-konform.

[Erfahren Sie mehr über Cloudflares Engagement für Datenschutz.](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
