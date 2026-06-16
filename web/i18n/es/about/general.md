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

FreeSaveVideo te ayuda a guardar contenido público de tus sitios favoritos: videos, audio, fotos o GIFs. Pega el enlace y empieza al instante.

Sin anuncios, rastreadores ni muros de pago. Solo una app web práctica para móvil y escritorio.
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

Todas las solicitudes al backend son anónimas y la información sobre los túneles está cifrada.
Tenemos una política estricta de cero registros y no rastreamos a personas individuales.

Cuando una solicitud necesita procesamiento adicional, FreeSaveVideo procesa los archivos sobre la marcha. Las partes procesadas se envían directamente al cliente por un túnel y nunca se guardan en disco.

También puedes [activar el túnel forzado](../../settings/privacy#tunnel) para proteger tu privacidad.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

Las funciones nuevas, como [remuxing](../../remux), funcionan localmente en tu dispositivo.
El procesamiento en el dispositivo es eficiente y no envía archivos locales por internet.
</section>

