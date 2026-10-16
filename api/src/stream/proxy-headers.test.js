import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import proxy from './proxy.js';

for (const service of ['drive.google.com', 'bilibili']) {
    test(`${service}: sends extractor headers once and preserves the requested range`, async () => {
        let observed;
        const server = createServer((req, res) => {
            if (req.url === '/media') {
                observed = req.headers;
                if (req.headers['user-agent'] !== 'extractor-agent' || req.headers.referer !== 'https://source.example/') {
                    res.writeHead(403).end();
                    return;
                }
                res.writeHead(206, {'content-type':'video/mp4','content-length':'4','content-range':'bytes 0-3/4'});
                res.end('test');
                return;
            }
            res.status = status => { res.statusCode = status; return res; };
            res.sendStatus = status => { res.statusCode = status; res.end(); };
            void proxy({service, urls:`http://127.0.0.1:${server.address().port}/media`, filename:'test.mp4',
                headers:{'User-Agent':'extractor-agent',Referer:'https://source.example/',Range:'bytes=99-'},
                range:req.headers.range}, res);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/proxy`, {headers:{Range:'bytes=0-3'}});
            assert.equal(response.status, 206);
            assert.equal(await response.text(), 'test');
            assert.equal(observed['user-agent'], 'extractor-agent');
            assert.equal(observed.referer, 'https://source.example/');
            assert.equal(observed.range, 'bytes=0-3');
            assert.equal(response.headers.get('content-range'), 'bytes 0-3/4');
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    });
}
