<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import QRCode from 'qrcode';
    import { currentApiURL } from '$lib/api/api-url';
    import { clerkLoaded, clerkUser, initClerk, getClerkToken, signIn } from '$lib/state/clerk';
    type Checkout = { checkoutId:string; kind:string; provider:string; status:string; readyToContinue:boolean;
        product:{key:string; amountFen:number; currency:string; points?:number; durationDays?:number; entitlements?:string[]};
        payment?:{codeUrl?:string; checkoutUrl?:string; paymentCode?:string} };
    let checkout:Checkout | null = null, error='', busy=false, consent=false, qr='', mounted=false, disposed=false, loadedKey='';
    $: chinese=$page.params.lang==='zh';
    $: copy=(en:string,zh:string) => chinese ? zh : en;
    const statusLabel=(status:string) => ({
        AWAITING_CONFIRMATION:copy('Awaiting your confirmation','\u7b49\u5f85\u4f60\u786e\u8ba4'),
        CREATING:copy('Generating payment','\u6b63\u5728\u751f\u6210\u4ed8\u6b3e\u5165\u53e3'),
        NEEDS_REVIEW:copy('Order needs review','\u8ba2\u5355\u9700\u8981\u6838\u67e5'),
        PENDING_PAYMENT:copy('Awaiting payment','\u7b49\u5f85\u4ed8\u6b3e'), CREATED:copy('Awaiting payment','\u7b49\u5f85\u4ed8\u6b3e'),
        PAID:copy('Payment received','\u4ed8\u6b3e\u5df2\u5230\u8d26'), EXPIRED:copy('Expired','\u5df2\u8fc7\u671f'),
        CLOSED:copy('Closed','\u5df2\u5173\u95ed'), FAILED:copy('Failed','\u5931\u8d25'), REFUNDED:copy('Refunded','\u5df2\u9000\u6b3e'),
    } as Record<string,string>)[status] || copy('Awaiting update','\u7b49\u5f85\u66f4\u65b0');
    const benefitLabel=(key:string) => ({member_download:copy('Downloads without points (fair-use limits apply)','\u4e0b\u8f7d\u514d\u79ef\u5206\uff08\u9075\u5faa\u5408\u7406\u4f7f\u7528\u9650\u989d\uff09'),
        ai_video_studio:copy('AI video studio','AI \u89c6\u9891\u5de5\u4f5c\u53f0'),video_recording:copy('Video recording','\u89c6\u9891\u5f55\u5236'),
        random_chat:copy('Member video chat','\u4f1a\u5458\u89c6\u9891\u804a\u5929')} as Record<string,string>)[key] || '';
    $: requestKey=`${$clerkUser?.id || ''}:${$page.params.id}`;
    $: if (mounted && $clerkLoaded && $clerkUser && loadedKey!==requestKey) {
        loadedKey=requestKey; checkout=null; qr=''; consent=false; void load();
    }
    $: if (!$clerkUser) { checkout=null; qr=''; consent=false; loadedKey=''; }
    const request=async (confirm=false) => {
        const key=requestKey, token=await getClerkToken();
        if (!token || key!==requestKey || disposed) throw new Error('UNAUTHORIZED');
        const response=await fetch(`${currentApiURL()}/agent/checkouts/${$page.params.id}${confirm ? '/confirm' : ''}`, {
            method:confirm ? 'POST' : 'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
            ...(confirm ? {body:JSON.stringify({confirmed:true})} : {}) });
        const payload=await response.json();
        if (!response.ok) throw new Error(payload?.error?.code || 'CHECKOUT_UNAVAILABLE');
        if (disposed || key!==requestKey) return;
        checkout=payload.data; consent=false; qr='';
        const code=checkout?.payment?.codeUrl;
        if (code && code.startsWith('weixin://wxpay/')) {
            const image=await QRCode.toDataURL(code,{width:260,margin:2});
            if (!disposed && key===requestKey) qr=image;
        }
    };
    const load=async (confirm=false) => {
        if (busy || (confirm && !consent)) return;
        const key=requestKey;
        busy=true; error='';
        try { await request(confirm); } catch (err) { error=err instanceof Error ? err.message : 'CHECKOUT_UNAVAILABLE'; }
        finally { busy=false; if (key!==requestKey) loadedKey=''; }
    };
    const trustedLink=(value?:string) => {
        try { const url=new URL(value || ''); return url.protocol==='https:' && !url.username && !url.password
            && ['nowpayments.io','buymeacoffee.com'].some(host => url.hostname===host || url.hostname.endsWith(`.${host}`)) ? url.href : ''; }
        catch { return ''; }
    };
    onMount(() => { mounted=true; void initClerk(); });
    onDestroy(() => { disposed=true; checkout=null; qr=''; });
</script>

<svelte:head><title>{copy('Confirm agent order','\u786e\u8ba4 agent \u8ba2\u5355')} - FreeSaveVideo</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<div class="checkout-page">
    <a href={`/${$page.params.lang}/account`}>{copy('Back to account','\u8fd4\u56de\u8d26\u6237')}</a>
    <h1>{copy('Confirm agent order','\u786e\u8ba4 agent \u8ba2\u5355')}</h1>
    <p>{copy('Your agent requested this purchase. Review it before generating a payment link. Payment is completed by you; no automatic renewal.','\u4f60\u7684 agent \u7533\u8bf7\u4e86\u8fd9\u7b14\u8d2d\u4e70\u3002\u8bf7\u6838\u5bf9\u540e\u518d\u751f\u6210\u4ed8\u6b3e\u5165\u53e3\u3002\u4ed8\u6b3e\u7531\u4f60\u5b8c\u6210\uff0c\u4e0d\u4f1a\u81ea\u52a8\u7eed\u8d39\u3002')}</p>
    {#if !$clerkLoaded}<p>{copy('Loading...','\u52a0\u8f7d\u4e2d...')}</p>
    {:else if !$clerkUser}<button on:click={() => signIn()}>{copy('Sign in to review your order','\u767b\u5f55\u540e\u67e5\u770b\u4f60\u7684\u8ba2\u5355')}</button>
    {:else}
        {#if error}<p role="alert">{error}</p>{/if}
        {#if checkout}
            <section>
                <h2>{checkout.kind==='credits' ? copy('Points top-up','\u79ef\u5206\u5145\u503c') : copy('Membership','\u4f1a\u5458')}</h2>
                <p class="amount">{checkout.product.currency} {(checkout.product.amountFen/100).toFixed(2)}</p>
                {#if checkout.product.points}<p>{checkout.product.points} {copy('points','\u79ef\u5206')}</p>{/if}
                {#if checkout.product.durationDays}<p>{checkout.product.durationDays} {copy('days','\u5929')}</p>{/if}
                {#if checkout.product.entitlements?.length}<ul>{#each checkout.product.entitlements as benefit}{#if benefitLabel(benefit)}<li>{benefitLabel(benefit)}</li>{/if}{/each}</ul>{/if}
                <p>{copy('Status','\u72b6\u6001')}: {statusLabel(checkout.status)}</p>
                {#if checkout.status==='AWAITING_CONFIRMATION'}
                    <p><a href={`/${$page.params.lang}/about/terms`}>{copy('Terms','\u670d\u52a1\u6761\u6b3e')}</a> &middot; <a href={`/${$page.params.lang}/about/refund`}>{copy('Refund policy','\u9000\u6b3e\u653f\u7b56')}</a></p>
                    <label><input type="checkbox" bind:checked={consent} />{copy('I reviewed this one-time purchase and agree to the terms and refund policy.','\u6211\u5df2\u6838\u5bf9\u8fd9\u7b14\u4e00\u6b21\u6027\u8d2d\u4e70\uff0c\u5e76\u540c\u610f\u670d\u52a1\u6761\u6b3e\u548c\u9000\u6b3e\u653f\u7b56\u3002')}</label>
                    <button disabled={busy || !consent} on:click={() => load(true)}>{copy('Confirm and generate payment','\u786e\u8ba4\u5e76\u751f\u6210\u4ed8\u6b3e\u5165\u53e3')}</button>
                {:else if checkout.readyToContinue}
                    <p role="status">{copy('Payment received. Tell your agent to check this order and continue the original task. Its download permissions remain as authorized.','\u4ed8\u6b3e\u5df2\u5230\u8d26\u3002\u8bf7\u901a\u77e5 agent \u67e5\u8be2\u8ba2\u5355\u5e76\u7ee7\u7eed\u539f\u4efb\u52a1\u3002\u4e0b\u8f7d\u6743\u9650\u4ecd\u6309\u539f\u6388\u6743\u6267\u884c\u3002')}</p>
                {:else if checkout.status==='NEEDS_REVIEW' || checkout.status==='CREATING'}
                    <p>{copy('Payment creation needs review. Do not create or pay a replacement order until this order has been checked.','\u4ed8\u6b3e\u8ba2\u5355\u521b\u5efa\u9700\u8981\u6838\u67e5\u3002\u8bf7\u5148\u6838\u67e5\u6b64\u8ba2\u5355\uff0c\u4e0d\u8981\u91cd\u590d\u521b\u5efa\u6216\u4ed8\u6b3e\u3002')}</p>
                {/if}
                {#if checkout.status==='CREATED'}
                {#if qr}<img src={qr} alt={copy('Scan with WeChat to pay','\u4f7f\u7528\u5fae\u4fe1\u626b\u7801\u4ed8\u6b3e')} width="260" height="260" />{/if}
                {#if trustedLink(checkout.payment?.checkoutUrl)}<p><a href={trustedLink(checkout.payment?.checkoutUrl)} target="_blank" rel="noreferrer noopener">{copy('Open payment page','\u6253\u5f00\u4ed8\u6b3e\u9875\u9762')}</a></p>{/if}
                {#if checkout.payment?.paymentCode}<p>{copy('Include this order code with your payment:','\u4ed8\u6b3e\u65f6\u8bf7\u586b\u5199\u8ba2\u5355\u7801\uff1a')} <code>{checkout.payment.paymentCode}</code></p>{/if}
                {/if}
            </section>
        {/if}
        <button disabled={busy} on:click={() => load()}>{copy('Refresh order status','\u5237\u65b0\u8ba2\u5355\u72b6\u6001')}</button>
    {/if}
</div>
<style>
    .checkout-page { max-width:700px; margin:auto; padding:2rem 1rem 5rem; }
    section { border:1px solid #8885; border-radius:12px; padding:1.5rem; margin:1.5rem 0; }
    p { line-height:1.6; overflow-wrap:anywhere; } .amount { font-size:1.8rem; }
    label { display:flex; gap:.6rem; margin:1rem 0; } button { padding:.7rem 1rem; cursor:pointer; }
    button:disabled { opacity:.5; cursor:default; } [role=alert] { color:#d33; }
</style>
