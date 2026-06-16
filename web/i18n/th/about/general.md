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

FreeSaveVideo ช่วยให้คุณบันทึกเนื้อหาสาธารณะจากเว็บไซต์ที่ชอบ เช่น วิดีโอ เสียง รูปภาพ หรือ GIF

ไม่มีโฆษณา ไม่มีตัวติดตาม และใช้งานได้บนมือถือและคอมพิวเตอร์
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

คำขอทั้งหมดไปยัง backend เป็นแบบนิรนาม และข้อมูลของ tunnel จะถูกเข้ารหัส
เรามีนโยบายไม่เก็บบันทึกและไม่ติดตามผู้ใช้

คุณสามารถ[เปิด forced tunneling](../../settings/privacy#tunnel) เพื่อปกป้องความเป็นส่วนตัวได้
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

ฟีเจอร์ใหม่ เช่น [remuxing](../../remux) ทำงานในเครื่องของคุณ
การประมวลผลบนอุปกรณ์ไม่ส่งไฟล์ขึ้นอินเทอร์เน็ต
</section>

