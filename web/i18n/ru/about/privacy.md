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

политика конфиденциальности bamboo_download проста: мы не собираем и не храним ничего о вас. то, что вы делаете, — только ваше дело, не наше и не чьё‑то ещё.

эти условия применимы только при использовании официального инстанса bamboo_download. в других случаях уточняйте информацию у хостера.
</section>

<section id="local">
<SectionHeading
    title={$t("about.heading.local")}
    sectionId="local"
/>

инструменты с локальной обработкой работают офлайн и никогда не отправляют данные в сеть. где это применимо, такие функции помечаются отдельно.
</section>

<section id="saving">
<SectionHeading
    title={$t("about.heading.saving")}
    sectionId="saving"
/>

при использовании функции сохранения в некоторых случаях bamboo_download шифрует и временно хранит данные, необходимые для туннелирования. они хранятся в RAM сервера обработки 90 секунд и безвозвратно удаляются после этого. никто не имеет к ним доступа, включая владельцев инстанса, если они не модифицируют официальный образ bamboo_download.

обработанные/туннелированные файлы нигде не кэшируются. всё передаётся в реальном времени. функция сохранения bamboo_download по сути является продвинутым прокси.
</section>

<section id="encryption">
<SectionHeading
    title={$t("about.heading.encryption")}
    sectionId="encryption"
/>

временно хранимые данные туннеля шифруются по стандарту AES‑256. ключи расшифровки содержатся только в ссылке доступа и никогда не логируются и не хранятся. доступ к ссылке и ключам есть только у конечного пользователя. ключи генерируются уникально для каждого туннеля.
</section>

{#if env.PLAUSIBLE_ENABLED}
<section id="plausible">
<SectionHeading
    title={$t("about.heading.plausible")}
    sectionId="plausible"
/>

чтобы сохранить приватность, мы используем анонимную аналитику трафика Plausible и получаем приблизительное число активных пользователей bamboo_download. никакая идентифицирующая информация не сохраняется, все данные обезличены и агрегированы. инстанс Plausible размещён и управляется нами.

Plausible не использует cookies и соответствует GDPR, CCPA и PECR.

[подробнее о принципах приватности Plausible.](https://plausible.io/privacy-focused-web-analytics)

если вы хотите отключить анонимную аналитику, сделайте это в <a href="../settings/privacy#analytics">настройках приватности</a>.
</section>
{/if}

<section id="cloudflare">
<SectionHeading
    title={$t("about.heading.cloudflare")}
    sectionId="cloudflare"
/>

мы используем сервисы Cloudflare для защиты от DDoS и ботов. также мы используем Cloudflare Pages для размещения статического веб‑приложения. всё это необходимо для лучшего опыта пользователей. это самый приватный и надёжный провайдер, который мы знаем.

Cloudflare полностью соответствует GDPR и HIPAA.

[подробнее о политике конфиденциальности Cloudflare.](https://www.cloudflare.com/trust-hub/privacy-and-data-protection/)
</section>
