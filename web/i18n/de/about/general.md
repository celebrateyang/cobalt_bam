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

FreeSaveVideo hilft dir, öffentliche Inhalte von deinen Lieblingswebsites zu speichern: Videos, Audio, Fotos oder GIFs. Füge einfach den Link ein und starte direkt.

Keine Werbung, keine Tracker, keine Paywalls. Nur eine praktische Web-App für Mobilgeräte und Desktop.
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

Alle Anfragen an das Backend sind anonym, und Informationen zu Tunneln werden verschlüsselt.
Wir haben eine strikte Zero-Log-Richtlinie und verfolgen keine einzelnen Personen.

Wenn eine Anfrage zusätzliche Verarbeitung braucht, verarbeitet FreeSaveVideo Dateien direkt während der Übertragung. Verarbeitete Teile werden per Tunnel direkt an den Client gesendet und nicht auf die Festplatte geschrieben.

Zusätzlich kannst du [erzwungenes Tunneling aktivieren](../../settings/privacy#tunnel), um deine Privatsphäre zu schützen.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

Neue Funktionen wie [Remuxing](../../remux) laufen lokal auf deinem Gerät.
Die Verarbeitung auf dem Gerät ist effizient und sendet keine lokalen Dateien über das Internet.
</section>

