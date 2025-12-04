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

bamboo download giúp bạn lưu bất kỳ thứ gì từ các trang web yêu thích của bạn: video, âm thanh, ảnh hoặc gif. chỉ cần dán liên kết và bạn đã sẵn sàng!

không có quảng cáo, trình theo dõi, tường phí hoặc những thứ vô nghĩa khác. chỉ là một ứng dụng web tiện lợi hoạt động mọi nơi, bất cứ khi nào bạn cần.
</section>



<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

tất cả các yêu cầu đến backend đều ẩn danh và tất cả thông tin về đường hầm đều được mã hóa.
chúng tôi có chính sách không ghi log nghiêm ngặt và không theo dõi *bất kỳ thứ gì* về cá nhân.

khi một yêu cầu cần xử lý bổ sung, bamboo download xử lý file một cách nhanh chóng.
nó được thực hiện bằng cách truyền các phần đã xử lý trực tiếp đến máy khách, mà không bao giờ lưu bất kỳ thứ gì vào đĩa.
ví dụ, phương pháp này được sử dụng khi dịch vụ nguồn cung cấp các kênh video và âm thanh dưới dạng các file riêng biệt.

ngoài ra, bạn có thể [bật truyền bắt buộc](../settings/privacy#tunnel) để bảo vệ quyền riêng tư của bạn.
khi bật, bamboo download sẽ truyền tất cả các file đã tải xuống.
không ai biết bạn tải xuống gì từ đâu, thậm chí cả nhà cung cấp mạng của bạn.
tất cả những gì họ thấy là bạn đang sử dụng một phiên bản bamboo download.
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

các tính năng mới nhất, chẳng hạn như [remuxing](/remux), hoạt động cục bộ trên thiết bị của bạn.
xử lý trên thiết bị hiệu quả và không bao giờ gửi bất kỳ thứ gì qua internet.
nó hoàn toàn phù hợp với mục tiêu tương lai của chúng tôi là chuyển càng nhiều xử lý càng tốt sang máy khách.
</section>
