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

FreeSaveVideo 可以帮你保存喜欢网站上的公开视频、音频、图片或 GIF。只需粘贴链接，就可以开始使用。

没有广告、追踪器或付费墙。这是一个适合移动端和桌面端的 Web 工具。
</section>


<section id="privacy">
<SectionHeading
    title={$t("about.heading.privacy")}
    sectionId="privacy"
/>

所有发往后端的请求都是匿名的，与隧道相关的信息会被加密。
我们坚持严格的零日志政策，不追踪任何个人。

需要额外处理时，FreeSaveVideo 会即时处理文件。处理后的数据会通过隧道直接传给客户端，不会保存到磁盘。

你还可以[启用强制隧道](../../settings/privacy#tunnel)来保护隐私。启用后，FreeSaveVideo 会通过隧道传输所有下载文件。
</section>


<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

最新功能，例如 [remuxing](../../remux)，会在你的设备上本地运行。
设备端处理效率高，且不会通过互联网发送本地文件。
</section>

