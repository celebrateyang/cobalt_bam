import Store from "../store/store.js";

import { nanoid } from "nanoid";
import { randomBytes } from "crypto";
import { strict as assert } from "assert";
import { setMaxListeners } from "node:events";

import { env } from "../config.js";
import { closeRequest } from "./shared.js";
import { decryptStream, encryptStream } from "../misc/crypto.js";
import { hashHmac } from "../security/secrets.js";
import { zip } from "../misc/utils.js";

// optional dependency
const freebind = env.freebindCIDR && await import('freebind').catch(() => {});

const streamCache = new Store('streams');

const internalStreamCache = new Map();

const normalizeUrlCandidateList = (primaryUrl, rawCandidates) => {
    const unique = [];
    const push = (value) => {
        if (typeof value !== "string") return;
        const url = value.trim();
        if (!url || unique.includes(url)) return;
        unique.push(url);
    };

    push(primaryUrl);
    if (Array.isArray(rawCandidates)) {
        for (const candidate of rawCandidates) {
            push(candidate);
        }
    }

    return unique;
};

const pickRandomCandidateUrl = (primaryUrl, rawCandidates) => {
    const candidates = normalizeUrlCandidateList(primaryUrl, rawCandidates);
    if (candidates.length <= 1) {
        return {
            url: primaryUrl,
            candidates,
        };
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    return {
        url: candidates[randomIndex],
        candidates,
    };
};

export function createStream(obj) {
    const lifespanSec =
        typeof obj?.lifespanSec === "number" &&
        Number.isFinite(obj.lifespanSec) &&
        obj.lifespanSec > 0
            ? Math.max(1, Math.round(obj.lifespanSec))
            : env.streamLifespan;

    const normalizedCandidates =
        typeof obj.url === "string"
            ? normalizeUrlCandidateList(obj.url, obj.urlCandidates)
            : [];

    const streamID = nanoid(),
        iv = randomBytes(16).toString('base64url'),
        secret = randomBytes(32).toString('base64url'),
        exp = new Date().getTime() + lifespanSec * 1000,
        hmac = hashHmac(`${streamID},${exp},${iv},${secret}`, 'stream').toString('base64url'),
        streamData = {
            exp: exp,
            type: obj.type,
            urls: obj.url,
            service: obj.service,
            filename: obj.filename,

            requestIP: obj.requestIP,
            headers: obj.headers,

            metadata: obj.fileMetadata || false,

            audioBitrate: obj.audioBitrate,
            audioCopy: !!obj.audioCopy,
            audioFormat: obj.audioFormat,

            isHLS: obj.isHLS || false,
            bypassTunnelRateLimit: obj.bypassTunnelRateLimit === true,
            originalRequest: obj.originalRequest,
            urlCandidates: normalizedCandidates.length > 1 ? normalizedCandidates : undefined,

            // url to a subtitle file
            subtitles: obj.subtitles,
        };

    // FIXME: this is now a Promise, but it is not awaited
    //        here. it may happen that the stream is not
    //        stored in the Store before it is requested.
    streamCache.set(
        streamID,
        encryptStream(streamData, iv, secret),
        lifespanSec
    );

    let streamLink = new URL('/tunnel', env.apiURL);

    const params = {
        'id': streamID,
        'exp': exp,
        'sig': hmac,
        'sec': secret,
        'iv': iv
    }

    for (const [key, value] of Object.entries(params)) {
        streamLink.searchParams.append(key, value);
    }

    return streamLink.toString();
}

export function createProxyTunnels(info) {
    const proxyTunnels = [];

    let urls = info.url;

    if (typeof urls === "string") {
        urls = [urls];
    }

    const tunnelTemplate = {
        type: "proxy",
        headers: info?.headers,
        requestIP: info?.requestIP,
    }

    const streamSelectionHint =
        info?.type === "audio"
            ? "audio"
            : (info?.type === "mute" ? "video" : undefined);

    for (const [index, url] of urls.entries()) {
        const tunnelOriginalRequest = info?.originalRequest
            ? {
                ...info.originalRequest,
                __streamIndex: index,
                __streamCount: urls.length,
                ...(streamSelectionHint
                    ? { __streamSelection: streamSelectionHint }
                    : {}),
            }
            : undefined;
        const tunnelUrlCandidates = (() => {
            if (!Array.isArray(info?.urlCandidates)) return undefined;
            if (urls.length === 1 && info.urlCandidates.every(item => typeof item === "string")) {
                return info.urlCandidates;
            }
            return info.urlCandidates[index];
        })();

        proxyTunnels.push(
            createStream({
                ...tunnelTemplate,
                url,
                service: info?.service,
                originalRequest: tunnelOriginalRequest,
                urlCandidates: tunnelUrlCandidates,
            })
        );
    }

    if (info.subtitles) {
        proxyTunnels.push(
            createStream({
                ...tunnelTemplate,
                url: info.subtitles,
                service: `${info?.service}-subtitles`,
            })
        );
    }

    if (info.cover) {
        proxyTunnels.push(
            createStream({
                ...tunnelTemplate,
                url: info.cover,
                service: `${info?.service}-cover`,
            })
        );
    }

    return proxyTunnels;
}

export function getInternalTunnel(id) {
    return internalStreamCache.get(id);
}

export function getInternalTunnelFromURL(url) {
    url = new URL(url);
    if (url.hostname !== '127.0.0.1') {
        return;
    }

    const id = url.searchParams.get('id');
    return getInternalTunnel(id);
}

export function createInternalStream(url, obj = {}, isSubtitles) {
    assert(typeof url === 'string');

    let dispatcher = obj.dispatcher;
    if (obj.requestIP && freebind) {
        dispatcher = freebind.dispatcherFromIP(obj.requestIP, { strict: false })
    }

    const streamID = nanoid();
    let controller = obj.controller;

    if (!controller) {
        controller = new AbortController();
        setMaxListeners(Infinity, controller.signal);
    }

    let headers;
    if (obj.headers) {
        headers = new Map(Object.entries(obj.headers));
    }

    // subtitles don't need special treatment unlike big media files
    const service = isSubtitles ? `${obj.service}-subtitles` : obj.service;
    const urlCandidates = normalizeUrlCandidateList(url, obj.urlCandidates);

    internalStreamCache.set(streamID, {
        url,
        urlCandidates: urlCandidates.length > 1 ? urlCandidates : undefined,
        service,
        headers,
        controller,
        dispatcher,
        isHLS: obj.isHLS,
        transplant: obj.transplant
    });

    let streamLink = new URL('/itunnel', `http://127.0.0.1:${env.tunnelPort}`);
    streamLink.searchParams.set('id', streamID);

    const cleanup = () => {
        destroyInternalStream(streamLink);
        controller.signal.removeEventListener('abort', cleanup);
    }

    controller.signal.addEventListener('abort', cleanup);

    return streamLink.toString();
}

function getInternalTunnelId(url) {
    url = new URL(url);
    if (url.hostname !== '127.0.0.1') {
        return;
    }

    return url.searchParams.get('id');
}

export function destroyInternalStream(url) {
    const id = getInternalTunnelId(url);

    if (internalStreamCache.has(id)) {
        closeRequest(getInternalTunnel(id)?.controller);
        internalStreamCache.delete(id);
    }
}

const transplantInternalTunnels = function(tunnelUrls, transplantUrls, transplantCandidates) {
    // console.log(`[transplantInternalTunnels] Starting transplant - tunnels: ${tunnelUrls.length}, urls: ${transplantUrls.length}`);
    
    if (tunnelUrls.length !== transplantUrls.length) {
        // console.log(`[transplantInternalTunnels] Length mismatch, aborting`);
        return;
    }

    let index = 0;
    for (const [ tun, url ] of zip(tunnelUrls, transplantUrls)) {
        const id = getInternalTunnelId(tun);
        const itunnel = getInternalTunnel(id);
        
        // console.log(`[transplantInternalTunnels] Processing tunnel ID: ${id}`);
        // console.log(`[transplantInternalTunnels] Old URL: ${itunnel?.url}`);
        // console.log(`[transplantInternalTunnels] New URL: ${url}`);

        if (!itunnel) {
            // console.log(`[transplantInternalTunnels] No internal tunnel found for ID: ${id}`);
            index += 1;
            continue;
        }
        
        itunnel.url = url;
        const nextCandidates = Array.isArray(transplantCandidates)
            ? transplantCandidates[index]
            : undefined;
        const normalizedCandidates = normalizeUrlCandidateList(url, nextCandidates);
        itunnel.urlCandidates = normalizedCandidates.length > 1
            ? normalizedCandidates
            : undefined;
        index += 1;
        // console.log(`[transplantInternalTunnels] Successfully updated tunnel ${id} URL`);
    }
    
    // console.log(`[transplantInternalTunnels] Transplant completed`);
}

const transplantTunnel = async function (dispatcher) {
    // console.log(`[transplant] Starting transplant for service: ${this.service}`);
    // console.log(`[transplant] Original request ID: ${this.originalRequest?.id}`);
    // console.log(`[transplant] Current URL: ${this.url}`);
    
    if (this.pendingTransplant) {
        // console.log(`[transplant] Transplant already pending, waiting...`);
        await this.pendingTransplant;
        return;
    }

    let finished;
    this.pendingTransplant = new Promise(r => finished = r);

    try {
        // console.log(`[transplant] Loading service handler: ${this.service}`);
        const handler = await import(`../processing/services/${this.service}.js`);
        
        /*
        console.log(`[transplant] Calling service with originalRequest:`, {
            id: this.originalRequest?.id,
            quality: this.originalRequest?.quality,
            format: this.originalRequest?.format,
            isAudioOnly: this.originalRequest?.isAudioOnly,
            isAudioMuted: this.originalRequest?.isAudioMuted
        });
        */
        
        const response = await handler.default({
            ...this.originalRequest,
            __streamRetry: true,
            dispatcher
        });

        /*
        console.log(`[transplant] Service response:`, {
            hasUrls: !!response.urls,
            urlsLength: response.urls ? [response.urls].flat().length : 0,
            error: response.error,
            type: response.type
        });
        */

        if (!response.urls) {
            // console.log(`[transplant] No URLs in response, aborting transplant`);
            return;
        }

        response.urls = [response.urls].flat();
        response.urlCandidates = Array.isArray(response.urlCandidates)
            ? response.urlCandidates
            : undefined;
        // console.log(`[transplant] Flattened URLs count: ${response.urls.length}`);

        const applySelectionByKind = (kind) => {
            if (!kind || response.urls.length <= 1) return false;

            const wantedIndex = kind === "audio" ? 1 : 0;
            if (wantedIndex >= response.urls.length) return false;

            response.urls = [response.urls[wantedIndex]];
            if (response.urlCandidates) {
                response.urlCandidates = [response.urlCandidates[wantedIndex]];
            }
            return true;
        };

        const selectionKind =
            typeof this.originalRequest?.__streamSelection === "string"
                ? this.originalRequest.__streamSelection
                : undefined;

        if (!applySelectionByKind(selectionKind)) {
            if (this.originalRequest.isAudioOnly && response.urls.length > 1) {
                response.urls = [response.urls[1]];
                if (response.urlCandidates) {
                    response.urlCandidates = [response.urlCandidates[1]];
                }
                // console.log(`[transplant] Using audio-only URL (index 1)`);
            } else if (this.originalRequest.isAudioMuted) {
                response.urls = [response.urls[0]];
                if (response.urlCandidates) {
                    response.urlCandidates = [response.urlCandidates[0]];
                }
                // console.log(`[transplant] Using muted video URL (index 0)`);
            }
        }

        const streamIndex = Number(this.originalRequest?.__streamIndex);
        if (Number.isInteger(streamIndex) && streamIndex >= 0) {
            if (streamIndex >= response.urls.length && response.urls.length > 1) {
                return;
            }

            if (response.urls.length > 1 || streamIndex > 0) {
                response.urls = [response.urls[streamIndex]];
                if (response.urlCandidates) {
                    response.urlCandidates = [response.urlCandidates[streamIndex]];
                }
            }
        }

        const tunnels = [this.urls].flat();
        // console.log(`[transplant] Tunnels count: ${tunnels.length}, response URLs count: ${response.urls.length}`);
        
        if (tunnels.length !== response.urls.length) {
            // console.log(`[transplant] Tunnel/URL count mismatch, aborting transplant`);
            return;
        }

        // console.log(`[transplant] Transplanting internal tunnels...`);
        transplantInternalTunnels(tunnels, response.urls, response.urlCandidates);
        // console.log(`[transplant] Transplant completed successfully`);
    }
    catch (error) {
        console.log(`[transplant] Error during transplant:`, error);
    }
    finally {
        finished();
        delete this.pendingTransplant;
    }
}

const isFfmpegStreamType = (type) => ['merge', 'remux', 'mute'].includes(type);

const shouldUseInternalFfmpegInputs = (streamInfo) =>
    isFfmpegStreamType(streamInfo?.type) &&
    streamInfo?.service === 'vimeo.com' &&
    streamInfo?.isHLS === true;

const buildIndexedOriginalRequest = (originalRequest, index, total) =>
    originalRequest
        ? {
            ...originalRequest,
            __streamIndex: index,
            __streamCount: total,
        }
        : undefined;

function wrapStream(streamInfo) {
    const url = streamInfo.urls;

    if (streamInfo.originalRequest) {
        streamInfo.transplant = transplantTunnel.bind(streamInfo);
    }

    const useInternalFfmpegInputs = shouldUseInternalFfmpegInputs(streamInfo);

    // FFmpeg usually reads from signed public tunnels, but Vimeo HLS merge/remux
    // works more reliably through localhost itunnels to avoid auth failures.
    if (isFfmpegStreamType(streamInfo.type) && !useInternalFfmpegInputs) {
        if (typeof url === 'string') {
            streamInfo.urls = createStream({
                type: 'proxy',
                url: url,
                urlCandidates: streamInfo.urlCandidates,
                service: streamInfo.service,
                isHLS: streamInfo.isHLS,
                filename: streamInfo.filename,
                headers: streamInfo.headers,
                requestIP: streamInfo.requestIP,
                originalRequest: streamInfo.originalRequest,
            });
        } else if (Array.isArray(url)) {
            const total = streamInfo.urls.length;
            streamInfo.urls = streamInfo.urls.map((singleUrl, index) => {
                const tunnelUrlCandidates = Array.isArray(streamInfo.urlCandidates)
                    ? streamInfo.urlCandidates[index]
                    : undefined;
                const tunnelOriginalRequest = buildIndexedOriginalRequest(
                    streamInfo.originalRequest,
                    index,
                    total,
                );

                return createStream({
                    type: 'proxy',
                    url: singleUrl,
                    urlCandidates: tunnelUrlCandidates,
                    service: streamInfo.service,
                    isHLS: streamInfo.isHLS,
                    filename: streamInfo.filename,
                    headers: streamInfo.headers,
                    requestIP: streamInfo.requestIP,
                    originalRequest: tunnelOriginalRequest,
                });
            });
        }
    } else {
        // For other types, use internal streams as before
        if (typeof url === 'string') {
            const selected = pickRandomCandidateUrl(url, streamInfo.urlCandidates);
            streamInfo.urls = createInternalStream(selected.url, {
                ...streamInfo,
                urlCandidates: selected.candidates,
            });
        } else if (Array.isArray(url)) {
            for (const idx in streamInfo.urls) {
                const selected = pickRandomCandidateUrl(
                    streamInfo.urls[idx],
                    Array.isArray(streamInfo.urlCandidates)
                        ? streamInfo.urlCandidates[idx]
                        : undefined,
                );
                streamInfo.urls[idx] = createInternalStream(
                    selected.url,
                    {
                        ...streamInfo,
                        originalRequest: buildIndexedOriginalRequest(
                            streamInfo.originalRequest,
                            Number(idx),
                            streamInfo.urls.length,
                        ),
                        urlCandidates: selected.candidates,
                    },
                );
            }
        } else throw 'invalid urls';
    }

    if (streamInfo.subtitles) {
        streamInfo.subtitles = createInternalStream(
            streamInfo.subtitles,
            streamInfo,
            /*isSubtitles=*/true
        );
    }

    return streamInfo;
}

export async function verifyStream(id, hmac, exp, secret, iv) {
    try {
        const ghmac = hashHmac(`${id},${exp},${iv},${secret}`, 'stream').toString('base64url');
        const cache = await streamCache.get(id.toString());

        if (ghmac !== String(hmac)) return { status: 401 };
        if (!cache) return { status: 404 };

        const streamInfo = JSON.parse(decryptStream(cache, iv, secret));

        if (!streamInfo) return { status: 404 };

        if (Number(exp) <= new Date().getTime())
            return { status: 404 };

        return wrapStream(streamInfo);
    }
    catch {
        return { status: 500 };
    }
}
