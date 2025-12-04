<script lang="ts">
    import { contacts, docs } from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
    import BetaTesters from "$components/misc/BetaTesters.svelte";
</script>

<section id="testers">
<SectionHeading
    title={$t("about.heading.testers")}
    sectionId="testers"
/>

cảm ơn sâu sắc đến những người phá vỡ thứ của chúng tôi vì đã thử nghiệm các bản cập nhật sớm và đảm bảo chúng ổn định.
họ cũng đã giúp chúng tôi phát hành cobalt 10!
<BetaTesters />

tất cả các liên kết đều là bên ngoài và dẫn đến trang web cá nhân hoặc mạng xã hội của họ.
</section>

<section id="meowbalt">
<SectionHeading
    title={$t("general.meowbalt")}
    sectionId="meowbalt"
/>

meowbalt là linh vật nhanh nhẹn của cobalt. anh ấy là một con mèo cực kỳ biểu cảm yêu thích internet nhanh.

tất cả các bản vẽ tuyệt vời về meowbalt mà bạn thấy trong cobalt đều được thực hiện bởi [GlitchyPSI](https://glitchypsi.xyz/).
anh ấy cũng là nhà thiết kế gốc của nhân vật.

bạn không thể sử dụng hoặc sửa đổi tác phẩm nghệ thuật của GlitchyPSI về meowbalt mà không có sự cho phép rõ ràng của anh ấy.

bạn không thể sử dụng hoặc sửa đổi thiết kế nhân vật meowbalt một cách thương mại hoặc ở bất kỳ hình thức nào không phải là fan art.
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

máy chủ xử lý cobalt là mã nguồn mở và được cấp phép theo [AGPL-3.0]({docs.apiLicense}).

giao diện người dùng cobalt là [nguồn đầu tiên](https://sourcefirst.com/) và được cấp phép theo [CC-BY-NC-SA 4.0]({docs.webLicense}).
chúng tôi quyết định sử dụng giấy phép này để ngăn chặn những kẻ lừa đảo kiếm lợi từ công việc của chúng tôi
& từ việc tạo ra các bản sao độc hại lừa dối mọi người và làm tổn hại danh tính công khai của chúng tôi.

chúng tôi dựa vào nhiều thư viện mã nguồn mở, tạo & phân phối của riêng chúng tôi.
bạn có thể xem danh sách đầy đủ các phụ thuộc trên [github]({contacts.github}).
</section>
