<script lang="ts">
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

la política de privacidad de bamboo_download es simple: no recopilamos ni almacenamos nada sobre ti. lo que haces es únicamente tu asunto, no el nuestro ni el de nadie más.

estos términos son aplicables solo cuando se usa la instancia oficial de bamboo_download. en otros casos, es posible que necesites contactar al anfitrión para obtener información precisa.
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

las herramientas que usan procesamiento en el dispositivo funcionan sin conexión, localmente, y nunca envían datos a ningún lugar. están explícitamente marcadas como tales cuando sea aplicable.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

cuando se usa la funcionalidad de guardado, en algunos casos bamboo_download encriptará y almacenará temporalmente la información necesaria para la canalización. se almacena en la RAM del servidor de procesamiento durante 90 segundos y se purga irreversiblemente después. nadie tiene acceso a ella, ni siquiera los propietarios de instancias, siempre y cuando no modifiquen la imagen oficial de bamboo_download.

los archivos procesados/canalizados nunca se almacenan en caché en ningún lugar. todo se canaliza en vivo. la funcionalidad de guardado de bamboo_download es esencialmente un servicio de proxy elegante.
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

los datos de túnel almacenados temporalmente se encriptan usando el estándar AES-256. las claves de descifrado solo se incluyen en el enlace de acceso y nunca se registran/almacenan en caché/almacenan en ningún lugar. solo el usuario final tiene acceso al enlace y las claves de encriptación. las claves se generan de manera única para cada túnel solicitado.
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

por el bien de la privacidad, usamos [análisis de tráfico anónimo de plausible](https://plausible.io/) para obtener un número aproximado de usuarios activos de bamboo_download. nunca se almacena información identificable sobre ti o tus solicitudes. todos los datos se anonimizan y agregan. la instancia de plausible que usamos está alojada y gestionada por nosotros.

plausible no usa cookies y es totalmente compatible con GDPR, CCPA y PECR.

[aprende más sobre la dedicación de plausible a la privacidad.](https://plausible.io/privacy-focused-web-analytics)

si deseas optar por no participar en análisis anónimos, puedes hacerlo en <a href="../settings/privacy#analytics">configuración de privacidad</a>.
</section>
{/if}

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

usamos servicios de cloudflare para protección contra DDoS y bots. también usamos cloudflare pages para desplegar y alojar la aplicación web estática. todos estos son necesarios para proporcionar la mejor experiencia para todos. es el proveedor más privado y confiable que conocemos.

cloudflare es totalmente compatible con GDPR y HIPAA.

[aprende más sobre la dedicación de cloudflare a la privacidad.](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
