<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

estos términos son aplicables solo cuando se usa la instancia oficial de freesavevideo.
en otros casos, es posible que necesites contactar al anfitrión para obtener información precisa.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

la funcionalidad de guardado simplifica la descarga de contenido de internet y no asume ninguna responsabilidad por el uso que se le dé al contenido guardado.
los servidores de procesamiento funcionan como proxies avanzados y nunca escriben ningún contenido en el disco.
todo se maneja en RAM y se purga permanentemente una vez que el túnel está hecho.
no tenemos registros de descarga y no podemos identificar a nadie.

[puedes leer más sobre cómo funcionan los túneles en nuestra política de privacidad.](privacy)
</section>

<section id="responsibility">
<SectionHeading
    title={$t("about.heading.responsibility")}
    sectionId="responsibility"
/>

tú (usuario final) eres responsable de lo que haces con nuestras herramientas, cómo usas y distribuyes el contenido resultante.
por favor ten cuidado al usar contenido de otros y siempre acredita a los creadores originales.
asegúrate de no violar ningún término o licencia.

cuando se use con fines educativos, siempre cita las fuentes y acredita a los creadores originales.

el uso justo y los créditos benefician a todos.
</section>

<section id="abuse">
<SectionHeading
    title={$t("about.heading.abuse")}
    sectionId="abuse"
/>

no tenemos forma de detectar comportamiento abusivo automáticamente, ya que freesavevideo es 100% anónimo.


ten en cuenta que este correo electrónico no está destinado a soporte de usuarios.
si estás experimentando problemas, contáctanos a través de cualquier método preferido en [la página de soporte](community).
</section>
