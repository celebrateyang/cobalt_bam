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

teriakan besar kepada para pemecah masalah kami untuk menguji pembaruan lebih awal dan memastikan pembaruan tersebut stabil.
mereka juga membantu kami mengirimkan FreeSaveVideo 10!
<BetaTesters />

semua tautan bersifat eksternal dan mengarah ke situs web pribadi atau media sosial mereka.
</section>

<section id="meowbalt">
<SectionHeading
    title={$t("general.meowbalt")}
    sectionId="meowbalt"
/>

meowbalt adalah maskot cepat FreeSaveVideo. dia adalah kucing yang sangat ekspresif dan menyukai internet cepat.

semua gambar meowbalt menakjubkan yang Anda lihat di FreeSaveVideo dibuat oleh [GlitchyPSI](https://glitchypsi.xyz/).
dia juga merupakan desainer asli dari karakter tersebut.

Anda tidak dapat menggunakan atau memodifikasi karya seni meowbalt GlitchyPSI tanpa izin tertulis darinya.

Anda tidak dapat menggunakan atau memodifikasi desain karakter meowbalt secara komersial atau dalam bentuk apa pun yang bukan karya penggemar.
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

Server pemrosesan FreeSaveVideo bersifat sumber terbuka dan menggunakan lisensi [AGPL-3.0]({docs.apiLicense}).

Frontend FreeSaveVideo bersifat [source first](https://sourcefirst.com/) dan menggunakan lisensi [CC-BY-NC-SA 4.0]({docs.webLicense}).
kami memutuskan untuk menggunakan lisensi ini untuk menghentikan para grifter mengambil keuntungan dari karya kami
& dari pembuatan klon jahat yang menipu orang dan merusak identitas publik kita.

kami mengandalkan banyak perpustakaan sumber terbuka, membuat & mendistribusikan milik kami sendiri.
Anda dapat melihat daftar lengkap dependensi di [GitHub]({contacts.github}).
</section>
