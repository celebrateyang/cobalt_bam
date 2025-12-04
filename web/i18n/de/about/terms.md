<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

Diese Bedingungen gelten nur bei Verwendung der offiziellen freesavevideo-Instanz.
In anderen Fällen müssen Sie möglicherweise den Hoster für genaue Informationen kontaktieren.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

Die Speicherfunktion vereinfacht das Herunterladen von Inhalten aus dem Internet und übernimmt keine Haftung dafür, wofür die gespeicherten Inhalte verwendet werden.
Verarbeitungsserver funktionieren wie erweiterte Proxys und schreiben niemals Inhalte auf die Festplatte.
Alles wird im RAM verarbeitet und dauerhaft gelöscht, sobald der Tunnel beendet ist.
Wir haben keine Download-Protokolle und können niemanden identifizieren.

[Sie können mehr darüber lesen, wie Tunnel funktionieren, in unserer Datenschutzrichtlinie.](privacy)
</section>

<section id="responsibility">
<SectionHeading
    title={$t("about.heading.responsibility")}
    sectionId="responsibility"
/>

Sie (Endbenutzer) sind dafür verantwortlich, was Sie mit unseren Tools tun, wie Sie resultierende Inhalte verwenden und verteilen.
Bitte seien Sie achtsam, wenn Sie Inhalte anderer verwenden, und geben Sie immer die ursprünglichen Urheber an.
Stellen Sie sicher, dass Sie keine Bedingungen oder Lizenzen verletzen.

Bei Verwendung für Bildungszwecke zitieren Sie immer Quellen und geben Sie die ursprünglichen Urheber an.

Fair Use und Credits kommen allen zugute.
</section>

<section id="abuse">
<SectionHeading
    title={$t("about.heading.abuse")}
    sectionId="abuse"
/>

Wir haben keine Möglichkeit, missbräuchliches Verhalten automatisch zu erkennen, da freesavevideo zu 100% anonym ist.


Bitte beachten Sie, dass diese E-Mail nicht für Benutzersupport gedacht ist.
Wenn Sie Probleme haben, kontaktieren Sie uns über eine beliebige bevorzugte Methode auf [der Support-Seite](community).
</section>
