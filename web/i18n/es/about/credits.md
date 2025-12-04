<script lang="ts">
    import { contacts, docs } from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
    import BetaTesters from "$components/misc/BetaTesters.svelte";
</script>

<section id="testers">
<SectionHeading
    title={$t("about.heading.testers")}
    sectionId="testers"
/>

un gran saludo a nuestros rompedores de cosas por probar actualizaciones temprano y asegurarse de que sean estables.
¡también nos ayudaron a lanzar cobalt 10!
<BetaTesters />

todos los enlaces son externos y llevan a sus sitios web personales o redes sociales.
</section>

<section id="meowbalt">
<SectionHeading
    title={$t("general.meowbalt")}
    sectionId="meowbalt"
/>

meowbalt es la mascota veloz de cobalt. es un gato extremadamente expresivo que ama el internet rápido.

todos los dibujos increíbles de meowbalt que ves en cobalt fueron hechos por [GlitchyPSI](https://glitchypsi.xyz/).
él también es el diseñador original del personaje.

no puedes usar o modificar las obras de arte de meowbalt de GlitchyPSI sin su permiso explícito.

no puedes usar o modificar el diseño del personaje meowbalt comercialmente o en cualquier forma que no sea fan art.
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

el servidor de procesamiento de cobalt es de código abierto y está licenciado bajo [AGPL-3.0]({docs.apiLicense}).

el frontend de cobalt es [primero en fuente](https://sourcefirst.com/) y está licenciado bajo [CC-BY-NC-SA 4.0]({docs.webLicense}).
decidimos usar esta licencia para detener a los estafadores de beneficiarse de nuestro trabajo
y de crear clones maliciosos que engañen a la gente y dañen nuestra identidad pública.

dependemos de muchas bibliotecas de código abierto, creamos y distribuimos las nuestras.
puedes ver la lista completa de dependencias en [github]({contacts.github}).
</section>
