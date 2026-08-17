<script lang="ts">
    import { contacts } from "$lib/env";
    import { t } from "$lib/i18n/translations";

    import DonateAltItem from "$components/donate/DonateAltItem.svelte";
</script>

<!--
    this page is not final and is more of a quick mockup. this is why donate alt item is used for links.
-->
<div id="community-body">
    <DonateAltItem
        type="open"
        name={$t("about.community.email")}
        address="mailto:{contacts.email}"
        title="{contacts.email}"
    />
</div>

<style>
    #community-body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }

    @media screen and (max-width: 1030px) {
        #community-body {
            grid-template-columns: 1fr;
        }
    }
</style>
