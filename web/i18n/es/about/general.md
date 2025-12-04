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

bamboo download te ayuda a guardar cualquier cosa de tus sitios web favoritos: video, audio, fotos o gifs. ¡solo pega el enlace y estarás listo para rockear!

sin anuncios, rastreadores, muros de pago u otra basura. solo una aplicación web conveniente que funciona en cualquier lugar, cuando la necesites.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

todas las solicitudes al backend son anónimas y toda la información sobre túneles está encriptada.
tenemos una política estricta de cero registros y no rastreamos *nada* sobre personas individuales.

cuando una solicitud necesita procesamiento adicional, bamboo download procesa archivos sobre la marcha.
se hace canalizando partes procesadas directamente al cliente, sin guardar nunca nada en el disco.
por ejemplo, este método se usa cuando el servicio de origen proporciona canales de video y audio como archivos separados.

adicionalmente, puedes [habilitar la canalización forzada](../settings/privacy#tunnel) para proteger tu privacidad.
cuando está habilitado, bamboo download canalizará todos los archivos descargados.
nadie sabrá desde dónde descargas algo, ni siquiera tu proveedor de red.
todo lo que verán es que estás usando una instancia de bamboo download.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

las características más nuevas, como [remezclar](/remux), funcionan localmente en tu dispositivo.
el procesamiento en el dispositivo es eficiente y nunca envía nada por internet.
se alinea perfectamente con nuestro objetivo futuro de mover tanto procesamiento como sea posible al cliente.
</section>
