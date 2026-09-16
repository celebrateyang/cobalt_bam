<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading title={$t("about.heading.general")} sectionId="general" />

Esta política se aplica al sitio oficial de FreeSaveVideo. Tratamos los datos necesarios para prestar el servicio, gestionar cuentas y puntos, proteger la seguridad, evitar abusos, supervisar el sistema y resolver problemas.
</section>

<section id="saving">
<SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

Podemos registrar el identificador y la hora de la solicitud, la cuenta o dirección de correo electrónico, la plataforma, el estado del procesamiento y los errores. Esta información se utiliza para supervisión, puntos, prevención de abusos y asistencia. Los registros actuales de intentos de descarga se eliminan por defecto después de dos días. Los datos de cuenta, pago, acceso y funciones guardadas por el usuario pueden conservarse durante más tiempo cuando sea necesario para prestar el servicio o cumplir obligaciones legales.

Los datos multimedia que requieren un túnel se procesan temporalmente durante la transferencia y no se utilizan como almacenamiento multimedia permanente.
</section>

<section id="encryption">
<SectionHeading title={$t("about.heading.encryption")} sectionId="encryption" />

Los datos temporales del túnel están protegidos mediante AES-256 y cada túnel utiliza una clave única. Quien reciba el enlace del túnel puede acceder al archivo; no lo publiques ni lo compartas con personas que no sean de confianza.
</section>

<section id="third-party">
<SectionHeading title="Análisis, publicidad y proveedores" sectionId="third-party" />

Según la configuración, el sitio oficial puede usar Plausible, Microsoft Clarity, Meta Pixel, Google Analytics o Google AdSense. Estos proveedores pueden tratar ubicación aproximada basada en IP, datos del dispositivo y navegador, páginas visitadas, cookies o identificadores publicitarios. El análisis de páginas no envía intencionadamente el contenido de la solicitud de descarga como evento analítico.

Clerk puede gestionar el inicio de sesión. Los proveedores de pago procesan los datos de pago; FreeSaveVideo puede conservar pedidos, estados de transacción y derechos de acceso, pero no almacena directamente el número completo de la tarjeta. Cloudflare presta servicios de alojamiento, entrega y seguridad y puede tratar datos de conexión y seguridad.
</section>
