import { isXinpianchangMedia } from '../adapters/xinpianchang';

// Keep header changes confined to the exact resource selected by the user.
export async function prepareXinpianchangDownload(url: string, sourcePageUrl?: string) {
    if (!isXinpianchangMedia(url)) throw new Error('Unsupported Xinpianchang resource.');
    const referer = new URL(sourcePageUrl || 'https://www.xinpianchang.com/');
    if (referer.protocol !== 'https:' || !/^(www\.)?xinpianchang\.com$/i.test(referer.hostname)) {
        throw new Error('Invalid Xinpianchang source page.');
    }
    const expiry = Number(new URL(url).searchParams.get('e'));
    if (expiry > 0 && expiry * 1000 <= Date.now()) {
        throw new Error('This media link expired. Play the video and scan again.');
    }
    const id = 100000 + Math.floor(Math.random() * 1000000000);
    await chrome.declarativeNetRequest.updateSessionRules({ addRules: [{
        id, priority: 1,
        // An explicit empty exclusion list includes main_frame too. Omitting both
        // resource type fields excludes it, unlike the fetch used by the probe.
        condition: { urlFilter: `|${url}|`, isUrlFilterCaseSensitive: true,
            excludedResourceTypes: [] },
        action: {
            type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
            requestHeaders: [{ header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
                value: referer.href }],
        },
    }] });
    return id;
}

export async function removeXinpianchangRule(ruleId: number) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
}
