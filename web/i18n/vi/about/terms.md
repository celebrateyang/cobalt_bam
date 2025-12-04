<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

các điều khoản này chỉ áp dụng khi sử dụng phiên bản freesavevideo chính thức.
trong các trường hợp khác, bạn có thể cần liên hệ với người lưu trữ để biết thông tin chính xác.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

chức năng lưu đơn giản hóa việc tải xuống nội dung từ internet và không chịu trách nhiệm cho việc nội dung đã lưu được sử dụng như thế nào.
các máy chủ xử lý hoạt động như proxy nâng cao và không bao giờ ghi bất kỳ nội dung nào vào đĩa.
mọi thứ được xử lý trong RAM và xóa vĩnh viễn sau khi đường hầm hoàn tất.
chúng tôi không có log tải xuống và không thể xác định bất kỳ ai.

[bạn có thể đọc thêm về cách đường hầm hoạt động trong chính sách bảo mật của chúng tôi.](privacy)
</section>

<section id="responsibility">
<SectionHeading
    title={$t("about.heading.responsibility")}
    sectionId="responsibility"
/>

bạn (người dùng cuối) chịu trách nhiệm cho những gì bạn làm với các công cụ của chúng tôi, cách bạn sử dụng và phân phối nội dung kết quả.
vui lòng lưu ý khi sử dụng nội dung của người khác và luôn ghi công các nhà sáng tạo gốc.
đảm bảo bạn không vi phạm bất kỳ điều khoản hoặc giấy phép nào.

khi được sử dụng cho mục đích giáo dục, luôn trích dẫn nguồn và ghi công các nhà sáng tạo gốc.

sử dụng hợp lý và ghi công mang lại lợi ích cho tất cả mọi người.
</section>

<section id="abuse">
<SectionHeading
    title={$t("about.heading.abuse")}
    sectionId="abuse"
/>

chúng tôi không có cách nào để phát hiện hành vi lạm dụng tự động, vì freesavevideo hoàn toàn ẩn danh.


vui lòng lưu ý rằng email này không dành cho hỗ trợ người dùng.
nếu bạn gặp vấn đề, hãy liên hệ với chúng tôi qua bất kỳ phương thức ưa thích nào trên [trang hỗ trợ](community).
</section>
