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

bamboo download hilft Ihnen, alles von Ihren Lieblingswebsites zu speichern: Videos, Audio, Fotos oder GIFs. F眉gen Sie einfach den Link ein und Sie sind bereit!

Keine Werbung, Tracker, Paywalls oder sonstiger Unsinn. Nur eine praktische Web-App, die 眉berall funktioniert, wann immer Sie sie brauchen.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

Alle Anfragen an das Backend sind anonym und alle Informationen 眉ber Tunnel sind verschl眉sselt.
Wir haben eine strikte Null-Protokoll-Richtlinie und verfolgen *nichts* 眉ber einzelne Personen.

Wenn eine Anfrage zus盲tzliche Verarbeitung ben枚tigt, verarbeitet bamboo download Dateien im laufenden Betrieb.
Dies geschieht durch Tunneln der verarbeiteten Teile direkt zum Client, ohne jemals etwas auf der Festplatte zu speichern.
Zum Beispiel wird diese Methode verwendet, wenn der Quelldienst Video- und Audiokan盲le als separate Dateien bereitstellt.

Zus盲tzlich k枚nnen Sie [erzwungenes Tunneling aktivieren](../settings/privacy#tunnel), um Ihre Privatsph盲re zu sch眉tzen.
Wenn aktiviert, wird bamboo download alle heruntergeladenen Dateien tunneln.
Niemand wird wissen, woher Sie etwas herunterladen, nicht einmal Ihr Netzwerkanbieter.
Alles, was sie sehen werden, ist, dass Sie eine bamboo download-Instanz verwenden.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

Neueste Funktionen, wie [Remuxing](../remux), arbeiten lokal auf Ihrem Ger盲t.
Die ger盲teinterne Verarbeitung ist effizient und sendet niemals etwas 眉ber das Internet.
Es passt perfekt zu unserem zuk眉nftigen Ziel, so viel Verarbeitung wie m枚glich auf den Client zu verlagern.
</section>

