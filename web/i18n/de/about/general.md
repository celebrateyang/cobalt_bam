<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="summary"><SectionHeading title={$t("about.heading.summary")} sectionId="summary" />

FreeSaveVideo ist ein Web-Werkzeug zum Speichern öffentlicher Inhalte unterstützter Plattformen, darunter Videos, Audio, Bilder und GIFs. Es funktioniert im Browser auf Mobilgeräten und Computern. Die offizielle Website kann Werbung anzeigen und die in der Datenschutzerklärung beschriebenen Analysedienste einsetzen.
</section>
<section id="privacy"><SectionHeading title={$t("about.heading.privacy")} sectionId="privacy" />

Downloadanfragen werden zur Analyse und Übertragung an den Server gesendet. Wenn eine Funktion eine Anmeldung erfordert, kann die Anfrage dem Konto zugeordnet werden. Anfrage- und Statusinformationen können für Sicherheit, Punkte, Überwachung und Fehlerbehebung protokolliert werden. Tunnelverschlüsselung macht Nutzer gegenüber dem Server nicht anonym. Einzelheiten stehen in der [Datenschutzerklärung](privacy).
</section>
<section id="local"><SectionHeading title={$t("about.heading.local")} sectionId="local" />

Als lokal gekennzeichnete Werkzeuge wie [Remux](../../remux) verarbeiten die ausgewählte Datei im Browser, ohne sie zur Konvertierung auf den Server hochzuladen. Die Seite selbst kann weiterhin Verbindungen zu Hosting-, Authentifizierungs-, Analyse- oder Werbediensten herstellen.
</section>
