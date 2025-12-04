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

bamboo download hilft Ihnen, alles von Ihren Lieblingswebsites zu speichern: Videos, Audio, Fotos oder GIFs. Fügen Sie einfach den Link ein und Sie sind bereit!

Keine Werbung, Tracker, Paywalls oder sonstiger Unsinn. Nur eine praktische Web-App, die überall funktioniert, wann immer Sie sie brauchen.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

Alle Anfragen an das Backend sind anonym und alle Informationen über Tunnel sind verschlüsselt.
Wir haben eine strikte Null-Protokoll-Richtlinie und verfolgen *nichts* über einzelne Personen.

Wenn eine Anfrage zusätzliche Verarbeitung benötigt, verarbeitet bamboo download Dateien im laufenden Betrieb.
Dies geschieht durch Tunneln der verarbeiteten Teile direkt zum Client, ohne jemals etwas auf der Festplatte zu speichern.
Zum Beispiel wird diese Methode verwendet, wenn der Quelldienst Video- und Audiokanäle als separate Dateien bereitstellt.

Zusätzlich können Sie [erzwungenes Tunneling aktivieren](../settings/privacy#tunnel), um Ihre Privatsphäre zu schützen.
Wenn aktiviert, wird bamboo download alle heruntergeladenen Dateien tunneln.
Niemand wird wissen, woher Sie etwas herunterladen, nicht einmal Ihr Netzwerkanbieter.
Alles, was sie sehen werden, ist, dass Sie eine bamboo download-Instanz verwenden.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

Neueste Funktionen, wie [Remuxing](/remux), arbeiten lokal auf Ihrem Gerät.
Die geräteinterne Verarbeitung ist effizient und sendet niemals etwas über das Internet.
Es passt perfekt zu unserem zukünftigen Ziel, so viel Verarbeitung wie möglich auf den Client zu verlagern.
</section>
