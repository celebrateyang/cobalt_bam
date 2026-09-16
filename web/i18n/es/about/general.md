<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="summary">
<SectionHeading title={$t("about.heading.summary")} sectionId="summary" />

FreeSaveVideo es una herramienta web para guardar contenido público de plataformas compatibles, como vídeos, audio, imágenes y GIF. Funciona desde el navegador de móviles y ordenadores. El sitio oficial puede mostrar publicidad y utilizar los servicios de análisis descritos en la Política de privacidad.
</section>

<section id="privacy">
<SectionHeading title={$t("about.heading.privacy")} sectionId="privacy" />

Las solicitudes de descarga se envían al servidor para su análisis y entrega. Cuando una función requiere iniciar sesión, la solicitud puede asociarse a la cuenta. Se puede registrar información de la solicitud y del estado del procesamiento para seguridad, puntos, supervisión y resolución de problemas.

El cifrado y las claves únicas de los túneles reducen el riesgo de adivinar o alterar el enlace, pero no hacen que el usuario sea anónimo frente al servidor. Consulta la [Política de privacidad](privacy) para conocer los plazos de conservación y los terceros utilizados.
</section>

<section id="local">
<SectionHeading title={$t("about.heading.local")} sectionId="local" />

Las herramientas marcadas como procesamiento local, como [remux](../../remux), procesan el archivo elegido en el navegador sin subirlo al servidor para convertirlo. La propia página aún puede conectarse a servicios de alojamiento, autenticación, análisis o publicidad.
</section>
