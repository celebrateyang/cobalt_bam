<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="summary"><SectionHeading title={$t("about.heading.summary")} sectionId="summary" />

FreeSaveVideo là công cụ web để lưu nội dung công khai từ các nền tảng được hỗ trợ, gồm video, âm thanh, hình ảnh và GIF. Công cụ hoạt động trong trình duyệt trên điện thoại và máy tính. Trang chính thức có thể hiển thị quảng cáo và dùng các dịch vụ phân tích nêu trong Chính sách quyền riêng tư.
</section>
<section id="privacy"><SectionHeading title={$t("about.heading.privacy")} sectionId="privacy" />

Yêu cầu tải xuống được gửi đến máy chủ để phân tích và chuyển tệp. Khi một tính năng yêu cầu đăng nhập, yêu cầu có thể được liên kết với tài khoản. Thông tin yêu cầu và trạng thái xử lý có thể được ghi nhận cho mục đích bảo mật, điểm, giám sát và khắc phục sự cố. Mã hóa đường hầm không làm người dùng ẩn danh với máy chủ. Xem [Chính sách quyền riêng tư](privacy).
</section>
<section id="local"><SectionHeading title={$t("about.heading.local")} sectionId="local" />

Các công cụ được ghi là xử lý cục bộ, như [remux](../../remux), xử lý tệp đã chọn trong trình duyệt mà không tải tệp đó lên máy chủ để chuyển đổi. Bản thân trang vẫn có thể kết nối với dịch vụ lưu trữ, xác thực, phân tích hoặc quảng cáo.
</section>
