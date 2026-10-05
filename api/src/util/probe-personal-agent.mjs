// Read-only production discovery checks. No credentials or paid operations.
const urls = [
    'https://freesavevideo.online/agents',
    'https://freesavevideo.online/zh',
    'https://freesavevideo.online/llms.txt',
    'https://freesavevideo.online/capabilities.json',
    'https://freesavevideo.online/robots.txt',
    'https://freesavevideo.online/sitemap.xml',
    'https://api.freesavevideo.online/agent/v1/capabilities',
    'https://api.freesavevideo.online/agent/openapi.json',
    'https://api.freesavevideo.online/agent/v1/balance',
    'https://api.freesavevideo.online/agent/grants',
];
await Promise.all(urls.map(async url => {
    try {
        const response = await fetch(url, {headers: {'User-Agent': 'FSV-Agent-Acceptance/1.0'}, signal: AbortSignal.timeout(20000)});
        const body = await response.text();
        const result = {url, finalUrl: response.url, status: response.status,
            type: response.headers.get('content-type'), link: response.headers.get('link'),
            guideFound: body.includes('/agents'), markerFound: body.includes('fsv-agent-access')};
        if (result.type?.includes('json')) {
            const data = JSON.parse(body);
            result.data = data.personalAgent || (url.endsWith('/openapi.json')
                ? {openapi:data.openapi,operations:Object.values(data.paths || {}).flatMap(path=>Object.values(path).map(op=>op.operationId))}
                : url.includes('/agent/') ? data : null);
        }
        const expected = ['/agent/v1/balance','/agent/grants'].some(path=>url.endsWith(path)) ? 401 : 200;
        result.pass = result.status === expected;
        if (url.endsWith('/agents') || url.endsWith('/zh')) result.pass &&= result.guideFound && result.markerFound && Boolean(result.link);
        if (url.endsWith('/capabilities.json')) result.pass &&= result.data?.supported === true;
        if (url.endsWith('/llms.txt') || url.endsWith('/robots.txt') || url.endsWith('/sitemap.xml')) result.pass &&= result.guideFound;
        if (!result.pass) process.exitCode = 1;
        console.log(JSON.stringify(result));
    } catch (error) { console.log(JSON.stringify({url,error:error.message})); process.exitCode = 1; }
}));
