import * as Storage from "$lib/storage";

const networkErrors = [
    "TypeError: Failed to fetch",
    "TypeError: network error",
];

let attempts = 0;

// 调试日志函数
const debugLog = (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[FetchWorker ${timestamp}] ${message}`;
    console.log(logMessage, data !== undefined ? data : '');
    // 同时发送到主线程以便在控制台查看
    self.postMessage({
        cobaltFetchWorker: {
            debug: { message: logMessage, data }
        }
    });
};

const fetchFile = async (url: string) => {
    debugLog('开始下载', { url: url.substring(0, 100) + '...' });

    const error = async (code: string, retry: boolean = true) => {
        attempts++;
        debugLog(`错误发生: ${code}`, { attempts, willRetry: retry && attempts <= 3 });

        // try 3 more times before actually failing
        if (retry && attempts <= 3) {
            debugLog('重试下载...');
            await fetchFile(url);
        } else {
            debugLog('下载失败，发送错误', { code });
            self.postMessage({
                cobaltFetchWorker: {
                    error: code,
                }
            });
            return self.close();
        }
    };

    try {
        debugLog('发起 fetch 请求...');
        const fetchStartTime = Date.now();
        const response = await fetch(url);
        debugLog('fetch 响应收到', {
            status: response.status,
            statusText: response.statusText,
            fetchTime: Date.now() - fetchStartTime + 'ms'
        });

        if (!response.ok) {
            debugLog('响应状态异常', { status: response.status });
            return error("queue.fetch.bad_response");
        }

        const contentType = response.headers.get('Content-Type')
            || 'application/octet-stream';

        const contentLength = response.headers.get('Content-Length');
        const estimatedLength = response.headers.get('Estimated-Content-Length');

        // 记录响应头信息
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });
        debugLog('响应头', headers);

        let expectedSize;

        if (contentLength) {
            expectedSize = +contentLength;
        } else if (estimatedLength) {
            expectedSize = +estimatedLength;
        }

        debugLog('预期大小', {
            contentLength,
            estimatedLength,
            expectedSize,
            hasSize: !!expectedSize
        });

        const reader = response.body?.getReader();

        const storage = await Storage.init(expectedSize);
        debugLog('存储初始化完成');

        if (!reader) {
            debugLog('无法获取 reader');
            return error("queue.fetch.no_file_reader");
        }

        let receivedBytes = 0;
        let lastLogTime = Date.now();
        let lastLogBytes = 0;
        let chunkCount = 0;
        const downloadStartTime = Date.now();

        debugLog('开始读取数据流...');

        while (true) {
            const readStartTime = Date.now();
            const { done, value } = await reader.read();
            const readTime = Date.now() - readStartTime;

            if (done) {
                debugLog('数据流读取完成', {
                    totalBytes: receivedBytes,
                    totalChunks: chunkCount,
                    totalTime: Date.now() - downloadStartTime + 'ms'
                });
                break;
            }

            chunkCount++;
            await storage.write(value, receivedBytes);
            receivedBytes += value.length;

            // 每5秒或每10%进度记录一次日志
            const now = Date.now();
            const progress = expectedSize ? Math.round((receivedBytes / expectedSize) * 100) : -1;

            if (now - lastLogTime >= 5000 || (progress > 0 && progress % 10 === 0 && receivedBytes !== lastLogBytes)) {
                const speed = ((receivedBytes - lastLogBytes) / (now - lastLogTime) * 1000 / 1024).toFixed(2);
                debugLog('下载进度', {
                    progress: progress + '%',
                    receivedBytes,
                    expectedSize,
                    chunkCount,
                    speed: speed + ' KB/s',
                    lastReadTime: readTime + 'ms'
                });
                lastLogTime = now;
                lastLogBytes = receivedBytes;
            }

            if (expectedSize) {
                self.postMessage({
                    cobaltFetchWorker: {
                        progress: progress,
                        size: receivedBytes,
                    }
                });
            }
        }

        if (receivedBytes === 0) {
            debugLog('下载内容为空');
            return error("queue.fetch.empty_tunnel");
        }

        debugLog('创建文件...', { receivedBytes, contentType });
        const file = Storage.retype(await storage.res(), contentType);
        debugLog('文件创建完成', { fileSize: file.size, fileName: file.name });

        if (contentLength && Number(contentLength) !== file.size) {
            debugLog('文件大小不匹配！', {
                expected: contentLength,
                actual: file.size
            });
            return error("queue.fetch.corrupted_file", false);
        }

        debugLog('下载成功完成', {
            fileSize: file.size,
            totalTime: Date.now() - downloadStartTime + 'ms'
        });

        self.postMessage({
            cobaltFetchWorker: {
                result: file
            }
        });
    } catch (e) {
        debugLog('捕获到异常', {
            error: String(e),
            name: (e as Error)?.name,
            message: (e as Error)?.message,
            stack: (e as Error)?.stack?.substring(0, 500)
        });

        // retry several times if the error is network-related
        if (networkErrors.includes(String(e))) {
            return error("queue.fetch.network_error");
        }
        console.error("error from the fetch worker:");
        console.error(e);
        return error("queue.fetch.crashed", false);
    }
}

self.onmessage = async (event: MessageEvent) => {
    if (event.data.cobaltFetchWorker) {
        await fetchFile(event.data.cobaltFetchWorker.url);
        self.close();
    }
}
