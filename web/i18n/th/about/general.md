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

FreeSaveVideo ช่วยให้คุณบันทึกเนื้อหาสาธารณะจากแพลตฟอร์มที่รองรับ เช่น วิดีโอ เสียง รูปภาพ หรือ GIF และใช้งานได้ทั้งบนมือถือและคอมพิวเตอร์

เว็บไซต์เวอร์ชันทางการอาจแสดงโฆษณาและใช้บริการวิเคราะห์ตามที่อธิบายใน[นโยบายความเป็นส่วนตัว](privacy)
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

คำขอดาวน์โหลดจะถูกส่งไปยัง backend เพื่อวิเคราะห์หรือส่งต่อไฟล์ และอาจเชื่อมโยงกับบัญชีเมื่อเว็บไซต์กำหนดให้เข้าสู่ระบบ ข้อมูลสถานะและรายละเอียดคำขอบางส่วนอาจถูกบันทึกเพื่อความปลอดภัย การคิดคะแนน และการแก้ไขปัญหา

ลิงก์ tunnel มีคีย์เข้ารหัสเพื่อป้องกันการเดาหรือแก้ไขลิงก์ แต่ไม่ได้ทำให้คำขอเป็นนิรนามต่อเซิร์ฟเวอร์ โปรดดูรายละเอียดการเก็บข้อมูล บริการวิเคราะห์ และโฆษณาใน[นโยบายความเป็นส่วนตัว](privacy)

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

