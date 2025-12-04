<script lang="ts">
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="general">
<SectionHeading
    title={$t("about.heading.general")}
    sectionId="general"
/>

chính sách bảo mật của bamboo_download rất đơn giản: chúng tôi không thu thập hoặc lưu trữ bất kỳ thứ gì về bạn. những gì bạn làm hoàn toàn là việc của bạn, không phải của chúng tôi hoặc bất kỳ ai khác.

các điều khoản này chỉ áp dụng khi sử dụng phiên bản bamboo_download chính thức. trong các trường hợp khác, bạn có thể cần liên hệ với người lưu trữ để biết thông tin chính xác.
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

các công cụ sử dụng xử lý trên thiết bị hoạt động ngoại tuyến, cục bộ và không bao giờ gửi bất kỳ dữ liệu nào đi đâu. chúng được đánh dấu rõ ràng như vậy bất cứ khi nào có thể.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

khi sử dụng chức năng lưu, trong một số trường hợp bamboo_download sẽ mã hóa & lưu trữ tạm thời thông tin cần thiết cho truyền. nó được lưu trữ trong RAM của máy chủ xử lý trong 90 giây và xóa vĩnh viễn sau đó. không ai có quyền truy cập vào nó, thậm chí cả chủ sở hữu phiên bản, miễn là họ không sửa đổi hình ảnh bamboo_download chính thức.

các file được xử lý/truyền không bao giờ được lưu vào bộ nhớ cache ở bất kỳ đâu. mọi thứ đều được truyền trực tiếp. chức năng lưu của bamboo_download về cơ bản là một dịch vụ proxy ưa thích.
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

dữ liệu đường hầm được lưu trữ tạm thời được mã hóa bằng tiêu chuẩn AES-256. khóa giải mã chỉ được bao gồm trong liên kết truy cập và không bao giờ được ghi log/lưu/lưu trữ ở bất kỳ đâu. chỉ người dùng cuối mới có quyền truy cập vào liên kết & khóa mã hóa. khóa được tạo duy nhất cho mỗi đường hầm được yêu cầu.
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

vì quyền riêng tư, chúng tôi sử dụng [phân tích lưu lượng ẩn danh của plausible](https://plausible.io/) để có số lượng người dùng bamboo_download hoạt động gần đúng. không có thông tin nhận dạng nào về bạn hoặc các yêu cầu của bạn được lưu trữ. tất cả dữ liệu đều được ẩn danh và tổng hợp. phiên bản plausible mà chúng tôi sử dụng được lưu trữ & quản lý bởi chúng tôi.

plausible không sử dụng cookie và tuân thủ hoàn toàn GDPR, CCPA và PECR.

[tìm hiểu thêm về sự cống hiến của plausible cho quyền riêng tư.](https://plausible.io/privacy-focused-web-analytics)

nếu bạn muốn từ chối phân tích ẩn danh, bạn có thể làm trong <a href="../settings/privacy#analytics">cài đặt quyền riêng tư</a>.
</section>
{/if}

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

chúng tôi sử dụng các dịch vụ cloudflare để bảo vệ ddos & bot. chúng tôi cũng sử dụng cloudflare pages để triển khai & lưu trữ ứng dụng web tĩnh. tất cả những điều này đều cần thiết để cung cấp trải nghiệm tốt nhất cho mọi người. đó là nhà cung cấp riêng tư & đáng tin cậy nhất mà chúng tôi biết.

cloudflare tuân thủ hoàn toàn GDPR và HIPAA.

[tìm hiểu thêm về sự cống hiến của cloudflare cho quyền riêng tư.](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
