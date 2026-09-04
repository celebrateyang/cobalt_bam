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

FreeSaveVideo membantu Anda menyimpan apa pun dari situs web favorit Anda: video, audio, foto, atau gif. cukup tempel tautannya dan Anda siap beraksi!

tidak ada iklan, pelacak, paywall, atau omong kosong lainnya. hanyalah aplikasi web praktis yang berfungsi di mana saja, kapan pun Anda membutuhkannya.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

semua permintaan ke backend bersifat anonim dan semua informasi tentang terowongan dienkripsi.
kami memiliki kebijakan nol pencatatan yang ketat dan tidak melacak *apa pun* tentang individu.

ketika permintaan memerlukan pemrosesan tambahan, FreeSaveVideo memproses file dengan cepat.
ini dilakukan dengan menyalurkan bagian yang diproses langsung ke klien, tanpa pernah menyimpan apa pun ke disk.
misalnya, metode ini digunakan ketika layanan sumber menyediakan saluran video dan audio sebagai file terpisah.

selain itu, Anda dapat [mengaktifkan penerowongan paksa](../../settings/privacy#tunnel) untuk melindungi privasi Anda.
ketika diaktifkan, FreeSaveVideo akan menyalurkan semua file yang diunduh.
tidak ada yang tahu dari mana Anda mengunduh sesuatu, bahkan penyedia jaringan Anda.
yang akan mereka lihat hanyalah Anda menggunakan instance FreeSaveVideo.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

fitur terbaru, seperti [remuxing](../../remux), berfungsi secara lokal di perangkat Anda.
Pemrosesan pada perangkat efisien dan tidak pernah mengirimkan apa pun melalui internet.
ini sangat selaras dengan tujuan masa depan kami untuk memindahkan sebanyak mungkin pemrosesan ke klien.
</section>

