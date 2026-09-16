<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="summary"><SectionHeading title={$t("about.heading.summary")} sectionId="summary" />

FreeSaveVideo adalah alat web untuk menyimpan konten publik dari platform yang didukung, termasuk video, audio, gambar, dan GIF. Alat ini bekerja di peramban ponsel dan komputer. Situs resmi dapat menampilkan iklan dan menggunakan layanan analitik yang dijelaskan dalam Kebijakan Privasi.
</section>
<section id="privacy"><SectionHeading title={$t("about.heading.privacy")} sectionId="privacy" />

Permintaan unduhan dikirim ke server untuk dianalisis dan diteruskan. Bila suatu fitur memerlukan login, permintaan dapat dikaitkan dengan akun. Informasi permintaan dan status pemrosesan dapat dicatat untuk keamanan, poin, pemantauan, dan pemecahan masalah. Enkripsi terowongan tidak membuat pengguna anonim terhadap server. Lihat [Kebijakan Privasi](privacy).
</section>
<section id="local"><SectionHeading title={$t("about.heading.local")} sectionId="local" />

Alat yang ditandai sebagai pemrosesan lokal, seperti [remux](../../remux), memproses berkas yang dipilih di peramban tanpa mengunggahnya ke server untuk konversi. Halaman tetap dapat terhubung ke layanan hosting, autentikasi, analitik, atau periklanan.
</section>
