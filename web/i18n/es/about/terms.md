<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading title={$t("about.heading.general")} sectionId="general" />

Estas condiciones se aplican al sitio oficial de FreeSaveVideo. La herramienta ayuda a guardar contenido público de plataformas compatibles cuando el usuario tiene derecho a hacerlo. No debe utilizarse para eludir controles de acceso a contenido privado, de pago, exclusivo para miembros o protegido mediante DRM.
</section>

<section id="saving">
<SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

El servidor analiza páginas públicas compatibles y, cuando es necesario, combina o entrega flujos multimedia al navegador. La información de solicitudes, cuentas y estados se trata conforme a la [Política de privacidad](privacy).
</section>

<section id="responsibility">
<SectionHeading title={$t("about.heading.responsibility")} sectionId="responsibility" />

El usuario es responsable del contenido que envía, de los archivos descargados y de su uso o distribución. Utiliza únicamente contenido público que te pertenezca, que tengas permiso para guardar o que la ley permita guardar. Respeta las condiciones de la plataforma de origen y los derechos de terceros.
</section>

<section id="abuse">
<SectionHeading title={$t("about.heading.abuse")} sectionId="abuse" />

Podemos limitar o suspender solicitudes, cuentas o fuentes concretas cuando detectemos abuso, solicitudes automatizadas excesivas, intentos de eludir controles de acceso o denuncias válidas de infracción. Utiliza la [página de contacto](contact) para solicitar ayuda o comunicar un problema.
</section>
