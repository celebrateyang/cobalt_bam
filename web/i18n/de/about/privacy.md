<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="general"><SectionHeading title={$t("about.heading.general")} sectionId="general" />

Diese Erklärung gilt für die offizielle FreeSaveVideo-Website. Wir verarbeiten Daten, die für die Bereitstellung des Dienstes, Konten und Punkte, Sicherheit, Missbrauchsschutz, Überwachung und Fehlerbehebung erforderlich sind.
</section>
<section id="saving"><SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

Anfrage-ID und -zeit, Konto oder E-Mail-Adresse, Plattform, Verarbeitungsstatus und Fehler können protokolliert werden. Diese Informationen dienen Überwachung, Punkteabrechnung, Missbrauchsschutz und Support. Aktuelle Aufzeichnungen zu Downloadversuchen werden standardmäßig nach zwei Tagen bereinigt. Konto-, Zahlungs-, Zugriffs- und vom Nutzer gespeicherte Funktionsdaten können länger aufbewahrt werden, wenn dies für den Dienst oder gesetzliche Pflichten erforderlich ist.

Mediendaten, die einen Tunnel benötigen, werden während der Übertragung vorübergehend verarbeitet und nicht als dauerhafter Medienspeicher verwendet.
</section>
<section id="encryption"><SectionHeading title={$t("about.heading.encryption")} sectionId="encryption" />

Temporäre Tunneldaten werden mit AES-256 geschützt und jeder Tunnel verwendet einen eigenen Schlüssel. Wer den Tunnellink erhält, kann auf die Datei zugreifen; veröffentlichen Sie ihn nicht und teilen Sie ihn nicht mit nicht vertrauenswürdigen Personen.
</section>
<section id="third-party"><SectionHeading title="Analyse, Werbung und Anbieter" sectionId="third-party" />

Je nach Konfiguration kann die Website Plausible, Microsoft Clarity, Meta Pixel, Google Analytics oder Google AdSense einsetzen. Diese Anbieter können ungefähre IP-basierte Standortdaten, Geräte- und Browserdaten, besuchte Seiten, Cookies oder Werbekennungen verarbeiten. Die Seitenanalyse sendet den Inhalt einer Downloadanfrage nicht absichtlich als Analyseereignis.

Clerk kann die Anmeldung verwalten. Zahlungsanbieter verarbeiten Zahlungsdaten; FreeSaveVideo kann Bestellungen, Transaktionsstatus und Zugriffsrechte speichern, speichert aber nicht selbst die vollständige Kartennummer. Cloudflare stellt Hosting, Auslieferung und Sicherheit bereit und kann Verbindungs- und Sicherheitsdaten verarbeiten.
</section>
