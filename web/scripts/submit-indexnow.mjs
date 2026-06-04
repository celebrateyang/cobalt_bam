const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
};

const unescapeXml = (value) =>
    value
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'");

const extractUrls = (xml) => {
    const urls = new Set();
    const locRe = /<loc>([\s\S]*?)<\/loc>/g;
    for (const match of xml.matchAll(locRe)) {
        const loc = unescapeXml(match[1].trim());
        if (loc) urls.add(loc);
    }
    return [...urls];
};

const chunk = (items, size) => {
    const groups = [];
    for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
    return groups;
};

const main = async () => {
    const origin = process.env.INDEXNOW_ORIGIN || 'https://freesavevideo.online';
    const host = process.env.INDEXNOW_HOST || new URL(origin).hostname;
    const key = required('INDEXNOW_KEY');
    const keyLocation = process.env.INDEXNOW_KEY_LOCATION || `${origin}/${key}.txt`;
    const sitemapUrl = process.env.INDEXNOW_SITEMAP_URL || `${origin}/sitemap.xml`;

    const sitemapRes = await fetch(sitemapUrl, {
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
    });
    if (!sitemapRes.ok) {
        throw new Error(`Failed to fetch sitemap: ${sitemapRes.status} ${await sitemapRes.text()}`);
    }

    const urls = extractUrls(await sitemapRes.text());
    if (urls.length === 0) throw new Error(`No URLs found in ${sitemapUrl}`);

    const groups = chunk(urls, 10000);
    for (let i = 0; i < groups.length; i += 1) {
        const res = await fetch('https://api.indexnow.org/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                host,
                key,
                keyLocation,
                urlList: groups[i],
            }),
        });

        if (!res.ok) {
            throw new Error(`IndexNow chunk ${i + 1}/${groups.length} failed: ${res.status} ${await res.text()}`);
        }

        console.log(`Submitted ${groups[i].length} URLs to IndexNow (${i + 1}/${groups.length})`);
    }

    console.log(`IndexNow submission complete: ${urls.length} URLs from ${sitemapUrl}`);
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

