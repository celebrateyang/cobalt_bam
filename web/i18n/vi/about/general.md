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

FreeSaveVideo giúp bạn lưu nội dung công khai từ các trang web yêu thích: video, âm thanh, ảnh hoặc GIF. Chỉ cần dán liên kết là có thể bắt đầu.

Không quảng cáo, không trình theo dõi, không tường phí. Đây là một ứng dụng web tiện lợi.
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

Mọi yêu cầu gửi tới backend đều ẩn danh và thông tin về tunnel được mã hóa.
Chúng tôi không ghi log và không theo dõi cá nhân.

Khi cần xử lý thêm, FreeSaveVideo xử lý tệp ngay trong quá trình truyền.

Bạn cũng có thể [bật tunnel bắt buộc](../../settings/privacy#tunnel) để bảo vệ quyền riêng tư.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

Các tính năng mới như [remuxing](../../remux) chạy cục bộ trên thiết bị của bạn.
Xử lý trên thiết bị không gửi tệp cục bộ qua internet.
</section>

