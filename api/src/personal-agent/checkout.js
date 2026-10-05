import { agentError } from "./policy.js";
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key,v[key]])) : v);

export const paymentAdapter = {
    products: async input => (await import("../routes/payments.js")).getAgentPaymentProducts(input),
    create: async input => (await import("../routes/payments.js")).runUserPaymentOperation(input),
    status: async input => (await import("../routes/payments.js")).runUserPaymentOperation(input),
};
const webOrigin = () => {
    const url = new URL(process.env.PERSONAL_AGENT_WEB_ORIGIN || "https://freesavevideo.online");
    if (url.protocol!=="https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new Error("Invalid checkout origin");
    return url.origin;
};
export const checkoutView = checkout => ({
    checkoutId:checkout.id, kind:checkout.kind, provider:checkout.provider, product:checkout.product,
    status:checkout.state==="AWAITING_CONFIRMATION" && Number(checkout.expires_at)<=Date.now() ? "EXPIRED" : checkout.state,
    expiresAt:Number(checkout.expires_at), confirmationUrl:`${webOrigin()}/en/account/agent-checkout/${checkout.id}`,
    userConfirmationRequired:true, readyToContinue:false,
});
export const createCheckoutService = ({db, payments=paymentAdapter}) => {
    const products = input => payments.products(input);
    const create = async (grant,input) => {
        const product = (await products(input)).find(p => p.key===input.productKey && p.enabled);
        if (!product) throw agentError("AGENT_PRODUCT_UNAVAILABLE",400);
        return checkoutView(await db.createCheckout(grant,input,product));
    };
    const find = async (id,userId,grantId) => {
        const checkout = await db.getCheckout(id,userId,grantId);
        if (!checkout) throw agentError("NOT_FOUND",404);
        return checkout;
    };
    const status = async (checkout,user,includePayment=false) => {
        const view = checkoutView(checkout);
        if (!checkout.order_id) return view;
        const result = await payments.status({user,kind:checkout.kind,orderId:checkout.order_id});
        if (result.status>=400 || !result.body?.data?.order) throw agentError("AGENT_ORDER_UNAVAILABLE",502);
        const order = result.body.data.order;
        if (order.user_id!==checkout.user_id || order.amount_fen!==checkout.amount || order.currency!==checkout.currency
            || order.product_key!==checkout.product_key) throw agentError("AGENT_ORDER_MISMATCH",502);
        // Never expose provider notifications, user identity or payment credentials to agents.
        view.status = order.status;
        view.readyToContinue = order.status==="PAID";
        view.order = {id:order.id,status:order.status,paidAt:order.paid_at ? Number(order.paid_at) : null};
        view.nextAction = view.readyToContinue ? "Check balance or membership permission, then call resolve_media. Payment does not change grant permissions." : "Ask the user to complete payment; poll no more than once every 15 seconds.";
        if (includePayment && order.status==="CREATED") {
            const data = order.provider_data || {};
            view.payment = checkout.provider==="wechat" ? {codeUrl:data.code_url}
                : {checkoutUrl:data.invoice_url || data.checkout_url,
                    ...(checkout.provider==="buymeacoffee" ? {paymentCode:order.out_trade_no} : {})};
        }
        return view;
    };
    const confirm = async (checkout,user) => {
        const product = (await products(checkout)).find(p => p.key===checkout.product_key && p.enabled);
        if (checkout.state==="AWAITING_CONFIRMATION" && (!product || product.amountFen!==checkout.amount || product.currency!==checkout.currency
            || canonical(product)!==canonical(checkout.product))) throw agentError("AGENT_PRODUCT_CHANGED",409);
        const claimed = await db.claimCheckout(checkout.id,user.id);
        if (claimed.claimed) {
            try {
                const result = await payments.create({user,kind:checkout.kind,provider:checkout.provider,
                    productKey:checkout.product_key,returnUrl:checkoutView(checkout).confirmationUrl,checkoutId:checkout.id});
                const order = result.body?.data?.order;
                if (result.status>=400 || !order?.id) throw agentError(result.body?.error?.code || "AGENT_CHECKOUT_UNCERTAIN",502);
                if (order.user_id!==checkout.user_id || order.amount_fen!==checkout.amount || order.currency!==checkout.currency
                    || order.product_key!==checkout.product_key) throw agentError("AGENT_ORDER_MISMATCH",502);
                await db.finishCheckout(checkout.id,order.id);
            } catch (error) {
                await db.finishCheckout(checkout.id,null,error.code || "AGENT_CHECKOUT_UNCERTAIN");
                throw agentError("AGENT_CHECKOUT_NEEDS_REVIEW",502);
            }
        }
        return status(await find(checkout.id,user.id),user,true);
    };
    return {products,create,find,status,confirm};
};
