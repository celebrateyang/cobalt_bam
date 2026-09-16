<script lang="ts">import { t } from "$lib/i18n/translations"; import SectionHeading from "$components/misc/SectionHeading.svelte";</script>
<section id="general"><SectionHeading title={$t("about.heading.general")} sectionId="general" />

Chính sách này áp dụng cho trang FreeSaveVideo chính thức. Chúng tôi xử lý dữ liệu cần thiết để cung cấp dịch vụ, quản lý tài khoản và điểm, bảo mật, ngăn lạm dụng, giám sát và khắc phục sự cố.
</section>
<section id="saving"><SectionHeading title={$t("about.heading.saving")} sectionId="saving" />

Hệ thống có thể ghi nhận mã và thời gian yêu cầu, tài khoản hoặc email, nền tảng, trạng thái xử lý và lỗi. Thông tin này được dùng để giám sát, quản lý điểm, ngăn lạm dụng và hỗ trợ. Bản ghi về lần thử tải xuống hiện được dọn mặc định sau hai ngày. Dữ liệu tài khoản, thanh toán, truy cập và tính năng do người dùng lưu có thể được giữ lâu hơn khi dịch vụ hoặc pháp luật yêu cầu.

Dữ liệu media cần đường hầm được xử lý tạm thời trong lúc truyền và không được dùng làm kho lưu trữ media lâu dài.
</section>
<section id="encryption"><SectionHeading title={$t("about.heading.encryption")} sectionId="encryption" />

Dữ liệu đường hầm tạm thời được bảo vệ bằng AES-256 và mỗi đường hầm dùng một khóa riêng. Người nhận được liên kết đường hầm có thể truy cập tệp; đừng công khai hoặc chia sẻ với người không đáng tin cậy.
</section>
<section id="third-party"><SectionHeading title="Phân tích, quảng cáo và nhà cung cấp" sectionId="third-party" />

Tùy cấu hình, trang có thể dùng Plausible, Microsoft Clarity, Meta Pixel, Google Analytics hoặc Google AdSense. Các nhà cung cấp này có thể xử lý vị trí gần đúng theo IP, dữ liệu thiết bị và trình duyệt, trang đã xem, cookie hoặc mã nhận dạng quảng cáo. Phân tích trang không cố ý gửi nội dung yêu cầu tải xuống dưới dạng sự kiện phân tích.

Clerk có thể quản lý đăng nhập. Nhà cung cấp thanh toán xử lý dữ liệu thanh toán; FreeSaveVideo có thể lưu đơn hàng, trạng thái giao dịch và quyền truy cập nhưng không trực tiếp lưu toàn bộ số thẻ. Cloudflare cung cấp lưu trữ, phân phối và bảo mật, đồng thời có thể xử lý dữ liệu kết nối và bảo mật.
</section>
