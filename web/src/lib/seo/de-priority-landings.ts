import type { SeoLandingLocaleContent } from '$lib/seo/landing-pages';

const disclaimer =
    'Speichere nur öffentlich zugängliche Inhalte, die du selbst veröffentlicht hast oder für deren Nutzung du eine Erlaubnis besitzt. Private, gelöschte, kostenpflichtige und DRM-geschützte Inhalte werden nicht unterstützt.';

export const dePriorityLandingLocales: Record<string, SeoLandingLocaleContent> =
    {
        'youtube-download': {
            metaTitle:
                'YouTube Downloader für Videos, Shorts und Audio | FreeSaveVideo',
            metaDescription:
                'Öffentliche YouTube-Videos über watch-, youtu.be- oder Shorts-Links verarbeiten. Verfügbare MP4-, Audio- und Qualitätsoptionen prüfen und im Browser speichern.',
            metaKeywords: [
                'youtube downloader',
                'youtube video herunterladen',
                'youtube mp4',
                'youtube audio',
            ],
            h1: 'YouTube-Videos im Browser herunterladen',
            lede: 'Diese Seite verarbeitet konkrete öffentliche YouTube-Videos. Sie erkennt normale watch-Links, youtu.be-Kurzlinks und Shorts-Adressen. Eine Kanalseite ist dagegen kein einzelnes Video und kann hier nicht als Downloadquelle dienen.',
            heroTags: [
                'watch?v=-Links',
                'youtu.be-Kurzlinks',
                'Shorts',
                'Video oder Audio',
            ],
            facts: [
                'Die angezeigten Formate stammen aus dem jeweiligen Video. Nicht jedes Video bietet dieselben Auflösungen oder eine separate Audiospur.',
                'Bei hohen Auflösungen können Bild und Ton getrennt vorliegen. FreeSaveVideo führt unterstützte Spuren im Downloadablauf zusammen.',
                'Ein watch-Link mit list-Parameter enthält zusätzlich eine Playlist. Für mehrere Einträge ist die eigene Playlist-Seite übersichtlicher.',
            ],
            stepsTitle: 'Vom YouTube-Link zur gespeicherten Datei',
            steps: [
                'Öffne das konkrete Video und kopiere den Link aus der Adresszeile oder über Teilen. Verwende keine Kanal-, Such- oder Studio-Seite.',
                'Füge den Link ein und warte, bis Titel, Dauer und verfügbare Formate angezeigt werden.',
                'Wähle Video, Nur-Audio oder Stumm sowie eine tatsächlich angebotene Qualität.',
                'Starte den Download und kontrolliere anschließend den Downloadverlauf deines Browsers. Auf Mobilgeräten liegt die Datei häufig in Dateien oder Downloads und nicht automatisch in der Galerie.',
            ],
            featuresTitle: 'Was diese YouTube-Seite tatsächlich verarbeitet',
            features: [
                'Einzelne öffentliche Videos über youtube.com/watch?v=… und youtu.be/…',
                'YouTube Shorts über youtube.com/shorts/… sowie gleichwertige watch-Links',
                'MP4- und Audioergebnisse, sofern die Quelle diese Formate bereitstellt',
                'Fortsetzbare Warteschlangenaufgaben für längere Verarbeitungsschritte',
                'Keine Kanalarchive, privaten Videos, Mitgliederinhalte oder DRM-Umgehung',
            ],
            supportedLinksTitle: 'Geeignete und ungeeignete YouTube-Links',
            supportedLinks: [
                {
                    title: 'Einzelnes Video',
                    description:
                        'youtube.com/watch?v=VIDEO_ID und youtu.be/VIDEO_ID bezeichnen ein konkretes Video.',
                },
                {
                    title: 'YouTube Short',
                    description:
                        'youtube.com/shorts/VIDEO_ID bezeichnet genau einen Short und nicht alle Shorts eines Kanals.',
                },
                {
                    title: 'Video innerhalb einer Playlist',
                    description:
                        'Enthält der Link sowohl v als auch list, kannst du das einzelne Video verarbeiten oder zur Playlist-Seite wechseln.',
                },
                {
                    title: 'Nicht geeignet',
                    description:
                        'Kanal-Homepages, Suchergebnisse, YouTube Studio sowie private oder nur nach Anmeldung sichtbare Seiten sind keine unterstützten Medienlinks.',
                },
            ],
            exampleTitle: 'Beispiel: Linktyp vor dem Download prüfen',
            exampleInput: 'Eingabe: https://www.youtube.com/watch?v=VIDEO_ID',
            exampleResult:
                'Erwartetes Ergebnis: ein einzelnes Video mit den aktuell verfügbaren Video- und Audiooptionen.',
            exampleActions: [
                'Stimmt der erkannte Titel nicht, den Vorgang abbrechen und den Link erneut vom Originalvideo kopieren.',
                'Fehlt eine gewünschte Qualität, eine angebotene Variante wählen; das Umbenennen der Dateiendung erzeugt kein anderes Format.',
                'Für eine vollständige Playlist einen Link mit list-Parameter auf der Playlist-Seite verwenden.',
            ],
            faqTitle: 'Fragen zu einzelnen YouTube-Videos',
            faqs: [
                {
                    q: 'Warum fehlen 1080p oder höhere Auflösungen?',
                    a: 'YouTube liefert hohe Auflösungen häufig als getrennte Bild- und Tonspuren. Eine Option erscheint nur, wenn die Quelle und der aktuelle Verarbeitungspfad sie verfügbar machen.',
                },
                {
                    q: 'Warum funktioniert eine Kanal-URL nicht?',
                    a: 'Eine Kanalseite beschreibt eine laufend veränderliche Sammlung und kein konkretes Medium. Öffne ein Video oder eine öffentliche Playlist und kopiere deren vollständigen Link.',
                },
                {
                    q: 'Wo finde ich die Datei auf dem iPhone oder Android-Gerät?',
                    a: 'Prüfe zuerst den Downloadverlauf des Browsers und den Ordner Downloads in der Dateien-App. Das Betriebssystem verschiebt Videodateien nicht immer automatisch in die Fotogalerie.',
                },
                {
                    q: 'Kann ich nur die Tonspur speichern?',
                    a: 'Ja, wenn für das Video ein Audioergebnis angeboten wird. Wähle vor der Verarbeitung den Audiomodus und speichere anschließend das zurückgegebene Format.',
                },
            ],
            disclaimer,
        },
        'youtube-shorts-download': {
            metaTitle:
                'YouTube Shorts Downloader für einzelne Shorts | FreeSaveVideo',
            metaDescription:
                'Einen öffentlichen YouTube Short über /shorts/, watch?v= oder youtu.be verarbeiten und verfügbare Video- oder Audioergebnisse im Browser speichern.',
            metaKeywords: [
                'youtube shorts downloader',
                'youtube shorts herunterladen',
                'shorts video download',
            ],
            h1: 'Einen YouTube Short herunterladen',
            lede: 'Diese Seite ist auf einzelne YouTube Shorts ausgerichtet. Sie akzeptiert den /shorts/-Link aus der App und gleichwertige watch- oder youtu.be-Adressen desselben Videos.',
            heroTags: [
                '/shorts/-Links',
                'Einzelnes Kurzvideo',
                'Mobile Nutzung',
                'Audio wenn verfügbar',
            ],
            facts: [
                'Ein Shorts-Link enthält eine Video-ID und bezeichnet genau einen Beitrag.',
                'Die Hochkantdarstellung ändert das Dateiformat nicht; gespeichert wird eine verfügbare Videodatei der Quelle.',
                'Ein Kanalprofil oder der Shorts-Feed kann nicht als endliche Liste aller Beiträge verarbeitet werden.',
            ],
            stepsTitle: 'Shorts-Link richtig kopieren und speichern',
            steps: [
                'Öffne den gewünschten Short, tippe auf Teilen und kopiere den Link zum einzelnen Beitrag.',
                'Füge die Adresse ein. Entferne begleitenden Nachrichtentext, falls die App mehr als nur die URL kopiert hat.',
                'Prüfe Vorschaudaten und verfügbare Video- oder Audiooptionen.',
                'Speichere die Datei und suche sie auf Mobilgeräten zunächst im Browser-Downloadverlauf oder im Ordner Downloads.',
            ],
            featuresTitle: 'Abgrenzung zur normalen YouTube-Seite',
            features: [
                'Erklärt speziell /shorts/VIDEO_ID und mobile Freigabelinks',
                'Behandelt einen Short statt einer Playlist oder eines Kanalarchivs',
                'Bewahrt das von der Quelle gelieferte Hochkantformat',
                'Zeigt nur tatsächlich verfügbare Qualitäts- und Audiooptionen',
            ],
            supportedLinksTitle: 'Unterstützte Shorts-Adressen',
            supportedLinks: [
                {
                    title: 'Shorts-Webadresse',
                    description:
                        'youtube.com/shorts/VIDEO_ID ist der eindeutigste Linktyp für einen Short.',
                },
                {
                    title: 'Geteilter Kurzlink',
                    description:
                        'youtu.be/VIDEO_ID kann auf denselben Short verweisen und wird als einzelnes Video behandelt.',
                },
                {
                    title: 'Watch-Adresse',
                    description:
                        'youtube.com/watch?v=VIDEO_ID funktioniert, wenn sie dasselbe öffentlich erreichbare Video öffnet.',
                },
                {
                    title: 'Nicht unterstützt',
                    description:
                        'Shorts-Feeds, Kanalregisterkarten, private Entwürfe und nur nach Anmeldung erreichbare Beiträge sind keine einzelnen öffentlichen Medienlinks.',
                },
            ],
            exampleTitle: 'Beispiel für einen Shorts-Link',
            exampleInput: 'Eingabe: https://www.youtube.com/shorts/VIDEO_ID',
            exampleResult:
                'Erwartetes Ergebnis: genau der gewählte Short, nicht weitere Videos desselben Kanals.',
            exampleActions: [
                'Vorschau und Titel kontrollieren.',
                'Eine angebotene Videoqualität auswählen.',
                'Bei reinem Ton nur eine vorhandene Audiooption verwenden.',
            ],
            faqTitle: 'Fragen zu YouTube Shorts',
            faqs: [
                {
                    q: 'Warum öffnet mein Link nur den Shorts-Feed?',
                    a: 'Kopiere den Link über Teilen direkt am gewünschten Short. Allgemeine Feed- und Kanaladressen enthalten keine eindeutige Video-ID.',
                },
                {
                    q: 'Bleibt das Video im Hochkantformat?',
                    a: 'Ja. FreeSaveVideo ändert das Seitenverhältnis nicht, sondern verarbeitet die von YouTube gelieferte Videospur.',
                },
                {
                    q: 'Kann ich alle Shorts eines Kanals laden?',
                    a: 'Nein. Diese Seite verarbeitet einen konkreten öffentlichen Short. Ein Kanal ist keine unterstützte Playlist.',
                },
                {
                    q: 'Warum erscheint keine Audiooption?',
                    a: 'Nicht jedes Ergebnis stellt eine separat speicherbare Audiospur bereit. Verwende nur die Optionen, die nach der Verarbeitung angezeigt werden.',
                },
            ],
            disclaimer,
        },
        'youtube-playlist-downloader': {
            metaTitle:
                'YouTube Playlist Downloader mit auswählbarer Batch-Liste | FreeSaveVideo',
            metaDescription:
                'Öffentliche YouTube-Playlist mit list-Parameter öffnen, verfügbare Einträge auswählen und Video- oder Audioaufgaben gesammelt verarbeiten.',
            metaKeywords: [
                'youtube playlist downloader',
                'youtube playlist herunterladen',
                'youtube batch download',
            ],
            h1: 'Öffentliche YouTube-Playlists als Batch verarbeiten',
            lede: 'Diese Seite verarbeitet eine klar bezeichnete öffentliche Playlist. Entscheidend ist der list-Parameter: Er identifiziert die Sammlung, die in auswählbare Einträge aufgelöst wird.',
            heroTags: [
                'playlist?list=',
                'Auswählbare Einträge',
                'Batch-Warteschlange',
                'Einzelfehler erneut versuchen',
            ],
            facts: [
                'Eine Playlist wird zuerst in einzelne verfügbare Videos aufgelöst; anschließend entscheidest du, welche Einträge in die Warteschlange kommen.',
                'Watch Later sowie automatisch erzeugte Mix- und Radio-Listen sind absichtlich ausgeschlossen.',
                'Wenn ein Video gelöscht, privat oder regional gesperrt ist, können andere verfügbare Einträge trotzdem verarbeitet werden.',
            ],
            stepsTitle: 'Eine Playlist erkennen, auswählen und abarbeiten',
            steps: [
                'Öffne die konkrete Playlist und kopiere die vollständige URL. Der Parameter list= muss erhalten bleiben.',
                'Füge den Link ein und warte, bis die aktuell erreichbaren Playlist-Einträge angezeigt werden.',
                'Wähle nur die benötigten Videos aus und lege pro Eintrag die angebotene Video- oder Audiooption fest.',
                'Starte die Batch-Warteschlange. Bereits gespeicherte Ergebnisse müssen nicht erneut geladen werden, wenn ein einzelner Eintrag fehlschlägt.',
            ],
            featuresTitle: 'Playlist-Funktionen und Grenzen',
            features: [
                'Erkennt youtube.com/playlist?list=… und watch-Links mit gültigem list-Parameter',
                'Zeigt erkannte Videos als auswählbare Liste vor dem Start',
                'Verarbeitet jeden ausgewählten Eintrag als eigene nachvollziehbare Aufgabe',
                'Lässt fehlgeschlagene Einträge einzeln erneut versuchen',
                'Unterstützt keine privaten Listen, Watch Later oder dynamischen Mix-/Radio-IDs',
            ],
            supportedLinksTitle: 'Welche Playlist-Links funktionieren?',
            supportedLinks: [
                {
                    title: 'Direkte Playlist',
                    description:
                        'youtube.com/playlist?list=PLAYLIST_ID enthält die benötigte Listenkennung.',
                },
                {
                    title: 'Video mit Playlist-Kontext',
                    description:
                        'youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID enthält Video- und Playlist-Informationen.',
                },
                {
                    title: 'Nur ein Video gewünscht',
                    description:
                        'Entferne den list-Parameter oder verwende die normale YouTube-Downloadseite.',
                },
                {
                    title: 'Ausgeschlossen',
                    description:
                        'Private Listen, Watch Later sowie IDs für dynamische Mix- oder Radio-Listen können nicht zuverlässig als feste Sammlung gelesen werden.',
                },
            ],
            exampleTitle: 'Beispiel für die entscheidende Listenkennung',
            exampleInput:
                'Eingabe: https://www.youtube.com/playlist?list=PLAYLIST_ID',
            exampleResult:
                'Erwartetes Ergebnis: eine überprüfbare Liste der aktuell verfügbaren Videos.',
            exampleActions: [
                'Nicht benötigte Einträge abwählen.',
                'Format je Eintrag prüfen.',
                'Batch starten und einzelne Fehler getrennt behandeln.',
            ],
            faqTitle: 'Fragen zum Playlist-Download',
            faqs: [
                {
                    q: 'Warum wird nur ein Video statt der Playlist erkannt?',
                    a: 'Meist fehlt der list-Parameter oder der kopierte Link bezeichnet nur das aktuelle Video. Öffne die Playlist selbst und kopiere ihre vollständige Adresse.',
                },
                {
                    q: 'Muss ich immer die gesamte Playlist laden?',
                    a: 'Nein. Prüfe die erkannte Liste und wähle nur die Einträge aus, die du tatsächlich benötigst.',
                },
                {
                    q: 'Was passiert bei einem privaten oder gelöschten Eintrag?',
                    a: 'Der betroffene Eintrag kann fehlen oder fehlschlagen. Andere öffentlich erreichbare Videos der Playlist können unabhängig davon weiterlaufen.',
                },
                {
                    q: 'Kann ich für einzelne Videos unterschiedliche Formate wählen?',
                    a: 'Ja, sofern die Oberfläche für die jeweiligen Einträge mehrere Ergebnisse anbietet.',
                },
            ],
            disclaimer,
        },
        'tiktok-no-watermark': {
            metaTitle:
                'TikTok Downloader für Videos ohne Wasserzeichen | FreeSaveVideo',
            metaDescription:
                'Öffentliche TikTok-Video-, Foto- und vm.tiktok.com-Links verarbeiten. Verfügbare Videos ohne Wasserzeichen, Bilder oder Originaltöne direkt speichern.',
            metaKeywords: [
                'tiktok downloader ohne wasserzeichen',
                'tiktok video herunterladen',
                'tiktok bilder speichern',
            ],
            h1: 'TikTok-Videos ohne Wasserzeichen speichern',
            lede: 'Diese Seite verarbeitet konkrete öffentliche TikTok-Beiträge und auflösbare Kurzlinks. Wenn TikTok eine Videodatei ohne eingebranntes Wasserzeichen bereitstellt, wird sie gegenüber einer Vorschauversion bevorzugt.',
            heroTags: [
                'Video-Beiträge',
                'Foto-Posts',
                'vm/vt-Kurzlinks',
                'Direkte CDN-Datei',
            ],
            facts: [
                'Video-Posts können eine abspielbare Datei und zusätzliche Kandidaten liefern; die verfügbaren Varianten hängen vom Beitrag ab.',
                'Foto-Posts werden als auswählbare Bildliste behandelt und nicht fälschlich zu einem Video zusammengesetzt.',
                'TikTok-Kurzlinks werden zuerst auf den konkreten öffentlichen Beitrag aufgelöst.',
            ],
            stepsTitle: 'Einen TikTok-Beitrag korrekt verarbeiten',
            steps: [
                'Öffne den einzelnen Beitrag, tippe auf Teilen und kopiere dessen Link. Verwende keinen Profil- oder Suchlink.',
                'Füge den vollständigen Link ein und warte, bis der Kurzlink aufgelöst und der Beitrag erkannt wurde.',
                'Prüfe, ob das Ergebnis ein Video, mehrere Fotos oder eine separate Tonspur enthält.',
                'Speichere die gewünschte Datei direkt; falls der Browser den Abruf blockiert, nutze die angebotene Browser- oder Erweiterungsübergabe.',
            ],
            featuresTitle: 'TikTok-spezifische Ergebnisse',
            features: [
                'Unterstützt konkrete /@name/video/ID-Adressen sowie vm.tiktok.com- und vt.tiktok.com-Kurzlinks',
                'Bevorzugt verfügbare Videokandidaten ohne eingebranntes Wasserzeichen',
                'Gibt Foto-Posts als einzelne auswählbare Bilder zurück',
                'Zeigt Originalton separat, wenn TikTok eine nutzbare Audiodatei bereitstellt',
                'Keine privaten Profile, Entwürfe oder nur nach Anmeldung sichtbaren Beiträge',
            ],
            supportedLinksTitle: 'Geeignete TikTok-Links',
            supportedLinks: [
                {
                    title: 'Konkretes Video',
                    description:
                        'tiktok.com/@BENUTZER/video/VIDEO_ID verweist auf genau einen Beitrag.',
                },
                {
                    title: 'Kurzlink aus der App',
                    description:
                        'vm.tiktok.com/… und vt.tiktok.com/… werden auf die öffentliche Beitragsadresse aufgelöst.',
                },
                {
                    title: 'Foto-Beitrag',
                    description:
                        'Öffentliche Slideshow-Posts können mehrere einzelne Bilddateien ergeben.',
                },
                {
                    title: 'Nicht geeignet',
                    description:
                        'Profilseiten, Suchergebnisse, Favoriten, private Beiträge und Entwürfe enthalten keinen öffentlich verarbeitbaren Medienlink.',
                },
            ],
            exampleTitle: 'Beispiel: Kurzlink oder Beitragslink',
            exampleInput:
                'Eingabe: https://www.tiktok.com/@BENUTZER/video/VIDEO_ID oder ein vm.tiktok.com-Kurzlink',
            exampleResult:
                'Erwartetes Ergebnis: Video, Bildliste oder Tonspur des genau bezeichneten öffentlichen Beitrags.',
            exampleActions: [
                'Beitragstitel und Medientyp prüfen.',
                'Bei Foto-Posts nur benötigte Bilder auswählen.',
                'Nur tatsächlich angebotene Video- oder Audioquellen speichern.',
            ],
            faqTitle: 'Fragen zum TikTok-Download',
            faqs: [
                {
                    q: 'Ist jedes Ergebnis garantiert ohne Wasserzeichen?',
                    a: 'Nein. Die Seite bevorzugt eine verfügbare Quelle ohne eingebranntes Wasserzeichen. Wenn TikTok nur eine andere Variante liefert, kann kein nicht vorhandenes Original erzeugt werden.',
                },
                {
                    q: 'Warum funktioniert ein Profillink nicht?',
                    a: 'Ein Profil ist eine veränderliche Sammlung und kein konkreter Beitrag. Öffne das gewünschte Video oder den Foto-Post und kopiere dessen Freigabelink.',
                },
                {
                    q: 'Warum erhalte ich mehrere Bilder statt eines Videos?',
                    a: 'Der TikTok-Beitrag ist ein Foto- oder Slideshow-Post. Die Bilder werden einzeln ausgegeben, damit du die gewünschten Dateien auswählen kannst.',
                },
                {
                    q: 'Warum schlägt ein zuvor funktionierender Kurzlink fehl?',
                    a: 'Kurzlinks und Beitragsverfügbarkeit können sich ändern. Öffne den Beitrag erneut in TikTok und kopiere einen aktuellen Freigabelink.',
                },
            ],
            disclaimer,
        },
        'tiktok-collection-download': {
            metaTitle:
                'TikTok Playlist und mehrere Links als Batch laden | FreeSaveVideo',
            metaDescription:
                'Unterstützte TikTok-Playlist-Links oder mehrere konkrete Video-URLs prüfen, Einträge auswählen und als getrennte Batch-Aufgaben verarbeiten.',
            metaKeywords: [
                'tiktok playlist downloader',
                'tiktok batch download',
                'mehrere tiktok videos herunterladen',
            ],
            h1: 'TikTok-Playlists und mehrere Links gesammelt verarbeiten',
            lede: 'Diese Seite unterscheidet zwischen einer echten TikTok-Playlist und einer frei zusammengestellten Liste einzelner Beitragslinks. Beide Wege enden in einer überprüfbaren Batch-Warteschlange.',
            heroTags: [
                'Playlist-URL',
                'Mehrere Beitragslinks',
                'Auswahlliste',
                'Fortsetzbare Aufgaben',
            ],
            facts: [
                'Eine öffentliche TikTok-Playlist kann über ihre Playlist-ID aufgelöst werden, wenn TikTok die Zugehörigkeit öffentlich ausliefert.',
                'Unabhängige Videos lassen sich als mehrere Links mit Leerzeichen oder Zeilenumbrüchen einfügen.',
                'Ein Creator-Profil ist keine feste Playlist und wird deshalb nicht automatisch als vollständiges Archiv gelesen.',
            ],
            stepsTitle: 'Playlist oder eigene Linkliste als Batch starten',
            steps: [
                'Kopiere eine öffentliche /playlist/-Adresse oder sammle die konkreten Links der einzelnen TikTok-Beiträge.',
                'Füge die Playlist beziehungsweise mehrere Links in das Eingabefeld ein.',
                'Prüfe die erkannten Einträge, entferne unerwünschte Videos und lege die verfügbaren Ausgabeoptionen fest.',
                'Starte die Warteschlange. Fehlgeschlagene Einträge lassen sich getrennt erneut versuchen, ohne fertige Dateien neu zu laden.',
            ],
            featuresTitle:
                'Unterschied zwischen Playlist und Mehrfach-Download',
            features: [
                'Playlist: ein Link mit einer öffentlichen Playlist-ID wird in zugehörige Einträge aufgelöst',
                'Mehrfach-Download: mehrere unabhängige Beitragslinks werden gemeinsam eingereiht',
                'Vor dem Start können erkannte Einträge einzeln abgewählt werden',
                'Jeder Beitrag behält seinen eigenen Status und seine verfügbaren Medienoptionen',
                'Creator-Profile und private Sammlungen werden nicht als vollständige Playlist behandelt',
            ],
            supportedLinksTitle: 'Welche TikTok-Sammlungen sind gemeint?',
            supportedLinks: [
                {
                    title: 'Öffentliche Playlist',
                    description:
                        'Eine TikTok-Adresse mit /playlist/ und einer erkennbaren Playlist-ID kann als Sammlung verarbeitet werden.',
                },
                {
                    title: 'Beitrag aus einer Playlist',
                    description:
                        'Wenn öffentliche Metadaten eine Playlist-ID enthalten, kann die umgebende Sammlung erkannt werden.',
                },
                {
                    title: 'Eigene Linkliste',
                    description:
                        'Mehrere /video/ID- oder aktuelle Kurzlinks lassen sich zeilenweise als Batch einfügen.',
                },
                {
                    title: 'Kein Profilarchiv',
                    description:
                        'Eine /@benutzer-Adresse definiert keine endliche, stabile Liste und wird nicht vollständig ausgelesen.',
                },
            ],
            exampleTitle: 'Beispiel für zwei verschiedene Batch-Wege',
            exampleInput:
                'Eingabe: eine öffentliche /playlist/-URL oder mehrere konkrete TikTok-Video-Links in getrennten Zeilen.',
            exampleResult:
                'Erwartetes Ergebnis: eine Liste einzelner Aufgaben, die vor dem Start überprüft werden kann.',
            exampleActions: [
                'Unpassende Einträge entfernen.',
                'Ausgabe je Aufgabe kontrollieren.',
                'Fehler nur für den betroffenen Beitrag erneut versuchen.',
            ],
            faqTitle: 'Fragen zu TikTok-Playlists und Batch-Aufgaben',
            faqs: [
                {
                    q: 'Kann ich einfach ein TikTok-Profil einfügen?',
                    a: 'Nein. Ein Profil ist keine feste Playlist. Verwende eine öffentliche Playlist-Adresse oder kopiere die konkreten Beitragslinks, die du verarbeiten möchtest.',
                },
                {
                    q: 'Warum enthält die erkannte Playlist weniger Videos als erwartet?',
                    a: 'TikTok kann einzelne Beiträge nicht mehr öffentlich ausliefern oder die Playlist nur teilweise zurückgeben. Prüfe die sichtbare Auswahlliste vor dem Start.',
                },
                {
                    q: 'Muss jeder Link dasselbe Format liefern?',
                    a: 'Nein. Jeder Beitrag wird einzeln verarbeitet und kann unterschiedliche Video-, Bild- oder Audiooptionen anbieten.',
                },
                {
                    q: 'Was passiert nach einer Unterbrechung?',
                    a: 'Bereits abgeschlossene Aufgaben bleiben erkennbar. Setze fehlgeschlagene oder unterbrochene Einträge separat fort, statt die gesamte Liste neu zu starten.',
                },
            ],
            disclaimer,
        },
        'tiktok-mp3-download': {
            metaTitle:
                'TikTok Audio Downloader für Originalton und Musik | FreeSaveVideo',
            metaDescription:
                'Verfügbare Tonspuren aus öffentlichen TikTok-Video-Links extrahieren. Originalton oder Musik im gelieferten Audioformat speichern, ohne Dateiendungen umzubenennen.',
            metaKeywords: [
                'tiktok audio downloader',
                'tiktok ton herunterladen',
                'tiktok musik speichern',
            ],
            h1: 'Audio aus einem TikTok-Video speichern',
            lede: 'Diese Seite ist ausschließlich auf die Tonspur eines konkreten öffentlichen TikTok-Beitrags ausgerichtet. Sie speichert eine vorhandene Audioquelle; sie verspricht nicht, jedes Ergebnis künstlich in MP3 umzuwandeln.',
            heroTags: [
                'Originalton',
                'Musikspur',
                'Audio-Modus',
                'Kein Umbenennen der Endung',
            ],
            facts: [
                'TikTok kann Originalton, lizenzierte Musik oder gar keine separat zugängliche Audiodatei liefern.',
                'Das angezeigte Dateiformat hängt von der Quelle und dem Verarbeitungsergebnis ab.',
                'Das bloße Umbenennen von .m4a oder .webm in .mp3 konvertiert die Audiodaten nicht.',
            ],
            stepsTitle: 'Nur die verfügbare TikTok-Tonspur laden',
            steps: [
                'Kopiere den Freigabelink des konkreten TikTok-Videos, dessen Ton du speichern darfst.',
                'Wähle den Audiomodus, füge den Link ein und starte die Verarbeitung.',
                'Prüfe Bezeichnung und Format der angebotenen Audiodatei.',
                'Speichere das Ergebnis. Falls du zwingend MP3 benötigst, konvertiere eine andere gelieferte Audiodatei anschließend mit einem geeigneten lokalen Werkzeug.',
            ],
            featuresTitle: 'Was der TikTok-Audiomodus leistet',
            features: [
                'Verarbeitet konkrete öffentliche Video- und Kurzlinks',
                'Zeigt eine separate Tonspur, wenn TikTok sie zugänglich macht',
                'Unterscheidet Download und echte Formatkonvertierung',
                'Erfindet keine MP3-Datei durch bloßes Ändern der Dateiendung',
                'Unterstützt keine geschützte oder nur innerhalb der App zugängliche Musik',
            ],
            supportedLinksTitle: 'Geeignete Quellen für den Audiomodus',
            supportedLinks: [
                {
                    title: 'Video mit Originalton',
                    description:
                        'Ein öffentlicher /video/ID-Link kann eine separat speicherbare Tonspur bereitstellen.',
                },
                {
                    title: 'TikTok-Kurzlink',
                    description:
                        'Ein aktueller vm- oder vt-Kurzlink wird zunächst auf den konkreten Beitrag aufgelöst.',
                },
                {
                    title: 'Foto-Post mit Musik',
                    description:
                        'Eine Audiodatei erscheint nur, wenn die öffentlich gelieferte Beitragsinformation eine nutzbare Quelle enthält.',
                },
                {
                    title: 'Nicht ausreichend',
                    description:
                        'Eine Sound-, Profil- oder Suchseite bezeichnet nicht zwingend eine öffentlich speicherbare Audiodatei.',
                },
            ],
            exampleTitle: 'Beispiel für ein Audioergebnis',
            exampleInput:
                'Eingabe: der Freigabelink eines konkreten öffentlichen TikTok-Videos im Audiomodus.',
            exampleResult:
                'Erwartetes Ergebnis: eine angebotene Audiodatei im tatsächlich verfügbaren Quellformat.',
            exampleActions: [
                'Format und Dateigröße prüfen.',
                'Datei vollständig speichern.',
                'Nur bei Bedarf anschließend lokal in MP3 konvertieren.',
            ],
            faqTitle: 'Fragen zum TikTok-Audio-Download',
            faqs: [
                {
                    q: 'Warum heißt die Datei nicht immer MP3?',
                    a: 'TikTok liefert Audio häufig in einem anderen Container oder Codec. FreeSaveVideo zeigt das verfügbare Ergebnis an, statt durch eine falsche Dateiendung eine MP3-Datei vorzutäuschen.',
                },
                {
                    q: 'Warum fehlt bei manchen Beiträgen die Audiooption?',
                    a: 'Die Musik kann geschützt, nur in der App nutzbar oder nicht als separate öffentliche Quelle verfügbar sein.',
                },
                {
                    q: 'Kann ich eine komplette Sound-Seite herunterladen?',
                    a: 'Nein. Verarbeite einen konkreten öffentlichen Beitrag. Eine Sound-Seite ist eine Sammlung und keine einzelne Audiodatei.',
                },
                {
                    q: 'Enthält die Tonspur Sprache und Musik?',
                    a: 'Gespeichert wird die von TikTok angebotene Audiospur des Beitrags. Eine nachträgliche Trennung von Sprache, Musik und Geräuschen findet nicht statt.',
                },
            ],
            disclaimer,
        },
        'instagram-video-download': {
            metaTitle:
                'Instagram Video Downloader für Posts, Reels und Karussells | FreeSaveVideo',
            metaDescription:
                'Öffentliche Instagram-Posts über /p/, /reel/ oder /tv/ verarbeiten. Videos, Bilder und Karussell-Elemente einzeln prüfen und speichern.',
            metaKeywords: [
                'instagram video downloader',
                'instagram video herunterladen',
                'instagram karussell speichern',
            ],
            h1: 'Medien aus öffentlichen Instagram-Posts speichern',
            lede: 'Diese Seite verarbeitet konkrete öffentliche Instagram-Posts. Sie unterscheidet Einzelvideo, Einzelbild und Karussell, damit die tatsächlich enthaltenen Medien nicht auf ein einziges Video reduziert werden.',
            heroTags: [
                '/p/-Posts',
                '/reel/-Links',
                'Karussells',
                'Video und Bilder',
            ],
            facts: [
                'Ein einzelner Video-Post liefert eine verfügbare Videodatei, ein Foto-Post ein Bild und ein Karussell eine auswählbare Medienliste.',
                'Die Erkennung verwendet die Post-Kennung und öffentlich erreichbare Metadaten; ein Profil allein reicht nicht aus.',
                'Story-Inhalte können ablaufen und sind nur verarbeitbar, solange der konkrete öffentliche Link noch erreichbar ist.',
            ],
            stepsTitle: 'Den richtigen Instagram-Post verarbeiten',
            steps: [
                'Öffne den konkreten Post, Reel- oder TV-Beitrag und kopiere seinen Freigabelink.',
                'Füge den Link ein und prüfe, ob der erwartete Benutzername und Medientyp erkannt wurden.',
                'Wähle bei einem Karussell nur die benötigten Videos oder Bilder aus.',
                'Speichere die Dateien einzeln. Private, gelöschte oder nur nach Anmeldung sichtbare Posts können nicht verarbeitet werden.',
            ],
            featuresTitle: 'Instagram-Posttypen und Ergebnisse',
            features: [
                'Verarbeitet öffentliche /p/-, /reel/- und /tv/-Adressen',
                'Gibt Einzelvideos als Video und Einzelbilder als Bilddatei zurück',
                'Zerlegt Karussells in auswählbare Medien statt nur das erste Element zu zeigen',
                'Kann eine vorhandene Videotonspur für den Audiomodus verwenden',
                'Unterstützt keine privaten Konten, Direktnachrichten oder Login-geschützten Inhalte',
            ],
            supportedLinksTitle: 'Welche Instagram-Links sind geeignet?',
            supportedLinks: [
                {
                    title: 'Normaler Post',
                    description:
                        'instagram.com/p/SHORTCODE/ kann ein Bild, ein Video oder ein gemischtes Karussell enthalten.',
                },
                {
                    title: 'Reel',
                    description:
                        'instagram.com/reel/SHORTCODE/ bezeichnet einen einzelnen Reel-Beitrag.',
                },
                {
                    title: 'Älterer TV-Link',
                    description:
                        'instagram.com/tv/SHORTCODE/ wird verarbeitet, wenn der öffentliche Beitrag noch verfügbar ist.',
                },
                {
                    title: 'Nicht geeignet',
                    description:
                        'Profilseiten, Explore, Direktnachrichten und private Posts sind keine öffentlich auslesbaren Einzelmedien.',
                },
            ],
            exampleTitle: 'Beispiel: Karussell statt Einzelvideo',
            exampleInput: 'Eingabe: https://www.instagram.com/p/SHORTCODE/',
            exampleResult:
                'Erwartetes Ergebnis: je nach Post ein Video, ein Bild oder mehrere auswählbare Karussell-Elemente.',
            exampleActions: [
                'Medientyp jedes Elements prüfen.',
                'Nur benötigte Karussell-Dateien auswählen.',
                'Bei abgelaufenen Story-Links einen aktuell erreichbaren Post verwenden.',
            ],
            faqTitle: 'Fragen zu Instagram-Posts',
            faqs: [
                {
                    q: 'Warum wird ein Karussell als mehrere Dateien angezeigt?',
                    a: 'Ein Karussell enthält eigenständige Bilder oder Videos. Die getrennte Ausgabe bewahrt alle Medien und ermöglicht eine gezielte Auswahl.',
                },
                {
                    q: 'Kann ich Inhalte privater Konten speichern?',
                    a: 'Nein. Die Seite verarbeitet nur Beiträge, die ohne Anmeldung öffentlich erreichbar sind.',
                },
                {
                    q: 'Warum funktioniert ein Story-Link später nicht mehr?',
                    a: 'Stories können ablaufen oder ihre öffentliche Adresse verlieren. Verarbeite den Link, solange der Beitrag noch erreichbar ist.',
                },
                {
                    q: 'Warum sehe ich nur eine Videoqualität?',
                    a: 'Instagram stellt für viele Posts nur eine direkt nutzbare Videovariante bereit. Die Seite zeigt keine künstlich hochskalierte Qualität an.',
                },
            ],
            disclaimer,
        },
        'instagram-reels-download': {
            metaTitle:
                'Instagram Reels Downloader für einzelne öffentliche Reels | FreeSaveVideo',
            metaDescription:
                'Einen konkreten öffentlichen Instagram-Reel-Link prüfen und die verfügbare Videodatei oder Tonspur im Browser speichern.',
            metaKeywords: [
                'instagram reels downloader',
                'instagram reel herunterladen',
                'reels video speichern',
            ],
            h1: 'Ein öffentliches Instagram Reel speichern',
            lede: 'Diese Seite konzentriert sich auf einen einzelnen Reel-Beitrag. Sie verarbeitet die /reel/-Adresse des Beitrags und vermeidet die Verwechslung mit Profilen, Explore-Seiten oder Karussell-Posts.',
            heroTags: [
                '/reel/-Adresse',
                'Einzelnes Video',
                'Originales Seitenverhältnis',
                'Audio wenn verfügbar',
            ],
            facts: [
                'Ein Reel wird über seinen Shortcode identifiziert und als einzelner Beitrag behandelt.',
                'Auflösung und Tonspur hängen von der öffentlich gelieferten Mediendatei ab.',
                'Die Seite entfernt keine grafischen Elemente, die bereits fest in das Video eingebrannt wurden.',
            ],
            stepsTitle: 'Reel-Link kopieren, prüfen und speichern',
            steps: [
                'Öffne das gewünschte Reel und kopiere über Teilen den Link zum einzelnen Beitrag.',
                'Füge die /reel/-Adresse ein und kontrolliere die erkannten Vorschaudaten.',
                'Wähle die verfügbare Videodatei oder – falls angeboten – die Tonspur.',
                'Speichere das Ergebnis im Browser. Suche die Datei auf Mobilgeräten zuerst im Downloadordner.',
            ],
            featuresTitle:
                'Was diese Reel-Seite von der Post-Seite unterscheidet',
            features: [
                'Akzeptiert konkrete öffentliche instagram.com/reel/SHORTCODE/-Adressen',
                'Behandelt genau ein Reel und kein vollständiges Konto',
                'Bewahrt das Seitenverhältnis und die gelieferte Videoqualität',
                'Zeigt eine Audiooption nur bei einer tatsächlich nutzbaren Tonspur',
                'Verweist für Karussells und normale Posts auf die allgemeine Instagram-Seite',
            ],
            supportedLinksTitle: 'Reel-Link eindeutig erkennen',
            supportedLinks: [
                {
                    title: 'Direkter Reel-Link',
                    description:
                        'instagram.com/reel/SHORTCODE/ ist die bevorzugte Adresse für einen einzelnen Reel-Beitrag.',
                },
                {
                    title: 'Geteilter Reel-Link',
                    description:
                        'Zusätzliche Tracking-Parameter sind nicht entscheidend; maßgeblich ist der erreichbare Shortcode des Beitrags.',
                },
                {
                    title: 'Normaler Post',
                    description:
                        'Öffnet der Link /p/ statt /reel/, nutze die allgemeine Instagram-Downloadseite für Bilder und Karussells.',
                },
                {
                    title: 'Nicht geeignet',
                    description:
                        'Profil-, Audio-, Explore- und Direktnachrichten-Links bezeichnen kein einzelnes öffentliches Reel-Video.',
                },
            ],
            exampleTitle: 'Beispiel für einen eindeutigen Reel-Link',
            exampleInput: 'Eingabe: https://www.instagram.com/reel/SHORTCODE/',
            exampleResult:
                'Erwartetes Ergebnis: die verfügbare Videodatei dieses einen Reels.',
            exampleActions: [
                'Vorschau vor dem Speichern kontrollieren.',
                'Gelieferte Qualität akzeptieren oder Vorgang abbrechen.',
                'Für /p/-Karussells zur Instagram-Post-Seite wechseln.',
            ],
            faqTitle: 'Fragen zu Instagram Reels',
            faqs: [
                {
                    q: 'Kann ich mit einem Profillink alle Reels laden?',
                    a: 'Nein. Ein Profil ist keine feste Sammlung. Kopiere den Link jedes öffentlichen Reels, das du verarbeiten möchtest.',
                },
                {
                    q: 'Entfernt die Seite eingebrannte Benutzernamen oder Grafiken?',
                    a: 'Nein. Elemente, die bereits Bestandteil der Videodatei sind, werden nicht aus dem Bild entfernt.',
                },
                {
                    q: 'Warum fehlt bei einem Reel der Ton?',
                    a: 'Der Beitrag kann stumm sein oder Instagram stellt keine separat nutzbare Tonspur bereit. Die Seite kann keine nicht gelieferte Audiospur erzeugen.',
                },
                {
                    q: 'Kann ein privates Reel verarbeitet werden?',
                    a: 'Nein. Der Beitrag muss ohne Anmeldung öffentlich erreichbar sein.',
                },
            ],
            disclaimer,
        },
    };

const dePriorityLandingSlugSet = new Set(Object.keys(dePriorityLandingLocales));

export const isDePriorityLanding = (slug: string): boolean =>
    dePriorityLandingSlugSet.has(slug);
