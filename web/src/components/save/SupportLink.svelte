<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { DISCORD_SUPPORT_URL } from "$lib/support";
    import { trackSave } from "$lib/analytics/saving";
</script>

<a href={DISCORD_SUPPORT_URL} target="_blank" rel="noreferrer noopener"
    on:click={() => trackSave("support", "discord")}>
    {$t("save.support.discord")}
</a>
