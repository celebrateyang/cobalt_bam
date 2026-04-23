import mime from "mime";
import ipaddr from "ipaddr.js";

import { apiSchema } from "./schema.js";
import { createProxyTunnels, createStream } from "../stream/manage.js";

const parseWithSchema = async (payload, stage = "unknown") => {
    try {
        const parsed = await apiSchema.safeParseAsync(payload);
        if (parsed.success) {
            return parsed;
        }

        const issues = Array.isArray(parsed.error?.issues)
            ? parsed.error.issues.slice(0, 6).map((issue) => ({
                path: Array.isArray(issue.path) ? issue.path.join(".") : "",
                code: issue.code,
                message: issue.message,
                expected: issue.expected,
                received: issue.received,
            }))
            : [];

        return {
            success: false,
            debug: {
                stage,
                issues,
            },
        };
    } catch (error) {
        return {
            success: false,
            debug: {
                stage,
                exception: String(error?.message || error || "unknown"),
            },
        };
    }
};

const sanitizeNullValues = (request) => {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
        return request;
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(request)) {
        if (value === null) continue;
        sanitized[key] = value;
    }

    return sanitized;
};

const pickKnownSchemaKeys = (request) => {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
        return request;
    }

    const known = {};
    const schemaShape = apiSchema?.shape || {};

    for (const key of Object.keys(schemaShape)) {
        if (!Object.prototype.hasOwnProperty.call(request, key)) {
            continue;
        }

        const value = request[key];
        if (value === undefined || value === null) {
            continue;
        }

        known[key] = value;
    }

    return known;
};

const enumAllowlist = {
    audioBitrate: new Set(["320", "256", "128", "96", "64", "8"]),
    audioFormat: new Set(["best", "mp3", "ogg", "wav", "opus"]),
    downloadMode: new Set(["auto", "audio", "mute"]),
    filenameStyle: new Set(["classic", "pretty", "basic", "nerdy"]),
    youtubeVideoCodec: new Set(["h264", "av1", "vp9"]),
    youtubeVideoContainer: new Set(["auto", "mp4", "webm", "mkv"]),
    videoQuality: new Set(["max", "4320", "2160", "1440", "1080", "720", "480", "360", "240", "144"]),
    localProcessing: new Set(["disabled", "preferred", "forced"]),
};

const booleanKeys = new Set([
    "batch",
    "disableMetadata",
    "allowH265",
    "convertGif",
    "tiktokFullAudio",
    "alwaysProxy",
    "youtubeHLS",
    "youtubeBetterAudio",
]);

const sanitizeInvalidKnownValues = (request) => {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
        return request;
    }

    const sanitized = { ...request };

    for (const [key, allowlist] of Object.entries(enumAllowlist)) {
        if (!Object.prototype.hasOwnProperty.call(sanitized, key)) continue;
        const value = sanitized[key];
        if (value === undefined || value === null) {
            delete sanitized[key];
            continue;
        }

        if (!allowlist.has(String(value))) {
            delete sanitized[key];
        }
    }

    for (const key of booleanKeys) {
        if (!Object.prototype.hasOwnProperty.call(sanitized, key)) continue;
        if (typeof sanitized[key] !== "boolean") {
            delete sanitized[key];
        }
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, "url") && typeof sanitized.url !== "string") {
        delete sanitized.url;
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, "youtubeDubLang")) {
        const v = sanitized.youtubeDubLang;
        if (typeof v !== "string" || v.length < 2 || v.length > 8 || !/^[0-9a-zA-Z\-]+$/.test(v)) {
            delete sanitized.youtubeDubLang;
        }
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, "subtitleLang")) {
        const v = sanitized.subtitleLang;
        if (typeof v !== "string" || v.length < 2 || v.length > 8 || !/^[0-9a-zA-Z\-]+$/.test(v)) {
            delete sanitized.subtitleLang;
        }
    }

    return sanitized;
};

export function createResponse(responseType, responseData) {
    const internalError = (code) => {
        return {
            status: 500,
            body: {
                status: "error",
                error: {
                    code: code || "error.api.fetch.critical.core",
                },
                critical: true
            }
        }
    }

    try {
        let status = 200,
            response = {};
        const duration =
            typeof responseData?.duration === "number" &&
            Number.isFinite(responseData.duration)
                ? responseData.duration
                : undefined;

        if (responseType === "error") {
            status = 400;
        }

        switch (responseType) {
            case "error":
                response = {
                    error: {
                        code: responseData?.code,
                        context: responseData?.context,
                    }
                }
                break;

            case "redirect":
                response = {
                    url: responseData?.url,
                    filename: responseData?.filename
                }
                break;

            case "tunnel":
                response = {
                    url: createStream(responseData),
                    filename: responseData?.filename
                }
                break;

            case "local-processing":
                const shouldExposeDirectSource =
                    responseData?.frontendProcessing === "hls" &&
                    responseData?.isHLS === true;

                response = {
                    type: responseData?.type,
                    service: responseData?.service,
                    tunnel: createProxyTunnels(responseData),
                    source: shouldExposeDirectSource
                        ? {
                            kind: "hls",
                            urls: Array.isArray(responseData?.url)
                                ? responseData.url
                                : [responseData?.url].filter(Boolean),
                            subtitles: responseData?.subtitles || undefined,
                            cover: responseData?.cover || undefined,
                        }
                        : undefined,
                    fallback: shouldExposeDirectSource
                        ? {
                            type: "tunnel",
                            url: createStream(responseData),
                            filename: responseData?.filename,
                        }
                        : undefined,

                    output: {
                        type: mime.getType(responseData?.filename) || undefined,
                        filename: responseData?.filename,
                        metadata: responseData?.fileMetadata || undefined,
                        subtitles: !!responseData?.subtitles || undefined,
                    },

                    audio: {
                        copy: responseData?.audioCopy,
                        format: responseData?.audioFormat,
                        bitrate: responseData?.audioBitrate,
                        cover: !!responseData?.cover || undefined,
                        cropCover: !!responseData?.cropCover || undefined,
                    },

                    isHLS: responseData?.isHLS,
                }

                if (!response.audio.format) {
                    if (response.type === "audio") {
                        // audio response without a format is invalid
                        return internalError();
                    }
                    delete response.audio;
                }

                if (!response.output.type || !response.output.filename) {
                    // response without a type or filename is invalid
                    return internalError();
                }
                break;

            case "picker":
                response = {
                    picker: responseData?.picker,
                    audio: responseData?.url,
                    audioFilename: responseData?.filename
                }
                break;

            case "critical":
                return internalError(responseData?.code);

            default:
                throw "unreachable"
        }

        return {
            status,
            body: {
                status: responseType,
                ...response,
                ...(duration != null ? { duration } : {})
            }
        }
    } catch {
        return internalError();
    }
}

export function normalizeRequest(request) {
    // TODO: remove after backwards compatibility period
    if ("localProcessing" in request && typeof request.localProcessing === "boolean") {
        request.localProcessing = request.localProcessing ? "preferred" : "disabled";
    }

    return (async () => {
        const firstPass = await parseWithSchema(request, "original");
        if (firstPass.success) {
            return firstPass;
        }

        const withoutNulls = sanitizeNullValues(request);
        if (withoutNulls !== request) {
            const secondPass = await parseWithSchema(withoutNulls, "drop_nulls");
            if (secondPass.success) {
                return secondPass;
            }
        }

        const knownOnly = pickKnownSchemaKeys(withoutNulls);
        if (knownOnly && knownOnly !== withoutNulls) {
            const thirdPass = await parseWithSchema(knownOnly, "known_keys_only");
            if (thirdPass.success) {
                return thirdPass;
            }

            const sanitizedKnown = sanitizeInvalidKnownValues(knownOnly);
            if (sanitizedKnown && sanitizedKnown !== knownOnly) {
                const fourthPass = await parseWithSchema(sanitizedKnown, "sanitize_invalid_values");
                if (fourthPass.success) {
                    return fourthPass;
                }
                return {
                    success: false,
                    debug: {
                        firstPass: firstPass.debug,
                        finalPass: fourthPass.debug,
                    },
                };
            }

            return {
                success: false,
                debug: {
                    firstPass: firstPass.debug,
                    finalPass: thirdPass.debug,
                },
            };
        }

        return {
            success: false,
            debug: {
                firstPass: firstPass.debug,
            },
        };
    })();
}

export function getIP(req, prefix = 56) {
    const strippedIP = req.ip.replace(/^::ffff:/, '');
    const ip = ipaddr.parse(strippedIP);
    if (ip.kind() === 'ipv4') {
        return strippedIP;
    }

    const v6Bytes = ip.toByteArray();
          v6Bytes.fill(0, prefix / 8);

    return ipaddr.fromByteArray(v6Bytes).toString();
}
