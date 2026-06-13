import { YOUTUBE_HOST_RE } from '../shared/messages';
import { bilibiliAdapter } from './bilibili';
import { douyinAdapter } from './douyin';
import { genericAdapter } from './generic';
import type { AdapterContext, AdapterResult, PlatformAdapter } from './types';

const youtubePolicyAdapter: PlatformAdapter = {
    id: 'youtube-policy',
    label: 'YouTube policy notice',
    matches(url) {
        return YOUTUBE_HOST_RE.test(url.hostname);
    },
    scan(context) {
        return {
            platform: 'youtube-policy',
            pageUrl: context.pageUrl,
            pageTitle: context.pageTitle,
            hostname: context.hostname,
            status: 'policyBlocked',
            media: [],
            warnings: ['YouTube downloads are not supported in this extension because of Chrome Web Store policy.'],
        };
    },
};

const adapters: PlatformAdapter[] = [youtubePolicyAdapter, douyinAdapter, bilibiliAdapter];

export const getMatchingAdapter = (url: URL): PlatformAdapter => {
    return adapters.find((adapter) => adapter.matches(url)) ?? genericAdapter;
};

const emptyFallbackResult = (context: AdapterContext, platform: PlatformAdapter['id'], warning: string): AdapterResult => ({
    platform,
    pageUrl: context.pageUrl,
    pageTitle: context.pageTitle,
    hostname: context.hostname,
    status: 'fallbackOnly',
    media: context.genericScan(),
    warnings: [warning],
});

export const scanWithAdapter = async (context: AdapterContext): Promise<AdapterResult> => {
    const adapter = getMatchingAdapter(new URL(context.pageUrl));
    if (adapter.id === 'generic') {
        return genericAdapter.scan(context);
    }

    try {
        const result = await adapter.scan(context);
        return result;
    } catch {
        return emptyFallbackResult(context, adapter.id, `${adapter.label} failed. Showing generic scan results instead.`);
    }
};
