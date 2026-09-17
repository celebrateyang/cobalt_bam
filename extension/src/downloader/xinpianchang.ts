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
        condition: { urlFilter: `|${url}|`, isUrlFilterCaseSensitive: true },
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

chrome.downloads.onChanged.addListener(delta => {
    if (delta.state?.current !== 'complete' && delta.state?.current !== 'interrupted') return;
    const key = `xpc-download-${delta.id}`;
    void chrome.storage.session.get(key).then(async value => {
        if (typeof value[key] !== 'number') return;
        await removeXinpianchangRule(value[key]);
        await chrome.storage.session.remove(key);
    }).catch(error => console.warn('Could not clean up Xinpianchang download headers.', error));
});
