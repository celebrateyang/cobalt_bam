import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Agent, request } from "undici";
import { isPublicAddress, parseSafeGenericURL } from "../processing/generic/url-safety.js";
import { agentError } from "../db/video-agent.js";

export const resolveImportUrl = async (value, resolver = lookup) => {
    const url = parseSafeGenericURL(value);
    if (!url || url.protocol !== "https:") throw agentError("VIDEO_AGENT_IMPORT_URL_BLOCKED", 400, "Import URL is blocked");
    const addresses = await resolver(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw agentError("VIDEO_AGENT_IMPORT_URL_BLOCKED", 400, "Import URL is blocked");
    return { url, addresses };
};

export const downloadAgentImport = async ({ url, targetPath, maxBytes, signal }) => {
    let current = url;
    for (let redirects = 0; redirects <= 5; redirects++) {
        const resolved = await resolveImportUrl(current);
        // Pin the validated addresses for this request, preventing a second DNS lookup/rebinding.
        const dispatcher = new Agent({ connect: { lookup: (_host, options, callback) => {
            const candidates = resolved.addresses.filter((item) => !options.family || item.family === options.family);
            if (!candidates.length) return callback(new Error("No validated address for family"));
            if (options.all) callback(null, candidates);
            else callback(null, candidates[0].address, candidates[0].family);
        } } });
        try {
            const response = await request(resolved.url, { dispatcher, signal, method: "GET", maxRedirections: 0,
                headersTimeout: 30000, bodyTimeout: 120000, headers: { "user-agent": "FreeSaveVideo-Video-Agent/1.0" } });
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                const location = response.headers.location;
                response.body.destroy();
                if (!location) throw agentError("VIDEO_AGENT_IMPORT_FETCH_FAILED", 502, "Redirect has no location");
                current = new URL(location, resolved.url).toString();
                continue;
            }
            if (response.statusCode !== 200 || Number(response.headers["content-length"] || 0) > maxBytes) {
                response.body.destroy();
                throw agentError("VIDEO_AGENT_IMPORT_FETCH_FAILED", 502, "Import failed or exceeds size limit");
            }
            let bytes = 0;
            const limiter = new Transform({ transform(chunk, _encoding, callback) {
                bytes += chunk.length;
                callback(bytes > maxBytes ? agentError("VIDEO_AGENT_FILE_TOO_LARGE", 413, "Source exceeds size limit") : null, chunk);
            } });
            await pipeline(response.body, limiter, createWriteStream(targetPath, { flags: "wx" }), { signal });
            if (!bytes) throw agentError("VIDEO_AGENT_IMPORT_FETCH_FAILED", 502, "Import is empty");
            return { sizeBytes: bytes };
        } finally { await dispatcher.destroy(); }
    }
    throw agentError("VIDEO_AGENT_IMPORT_FETCH_FAILED", 502, "Too many redirects");
};
