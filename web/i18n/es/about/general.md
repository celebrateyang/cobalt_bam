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

bamboo download te ayuda a guardar cualquier cosa de tus sitios web favoritos: video, audio, fotos o gifs. 隆solo pega el enlace y estar谩s listo para rockear!

sin anuncios, rastreadores, muros de pago u otra basura. solo una aplicaci贸n web conveniente que funciona en cualquier lugar, cuando la necesites.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

todas las solicitudes al backend son an贸nimas y toda la informaci贸n sobre t煤neles est谩 encriptada.
tenemos una pol铆tica estricta de cero registros y no rastreamos *nada* sobre personas individuales.

cuando una solicitud necesita procesamiento adicional, bamboo download procesa archivos sobre la marcha.
se hace canalizando partes procesadas directamente al cliente, sin guardar nunca nada en el disco.
por ejemplo, este m茅todo se usa cuando el servicio de origen proporciona canales de video y audio como archivos separados.

adicionalmente, puedes [habilitar la canalizaci贸n forzada](../settings/privacy#tunnel) para proteger tu privacidad.
cuando est谩 habilitado, bamboo download canalizar谩 todos los archivos descargados.
nadie sabr谩 desde d贸nde descargas algo, ni siquiera tu proveedor de red.
todo lo que ver谩n es que est谩s usando una instancia de bamboo download.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

las caracter铆sticas m谩s nuevas, como [remezclar](../remux/remux), funcionan localmente en tu dispositivo.
el procesamiento en el dispositivo es eficiente y nunca env铆a nada por internet.
se alinea perfectamente con nuestro objetivo futuro de mover tanto procesamiento como sea posible al cliente.
</section>

