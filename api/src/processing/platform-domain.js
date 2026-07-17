import { isIP } from "node:net";

import psl from "@imput/psl";

const blockedHostnameSuffixes = [
    ".example",
    ".home",
    ".internal",
    ".invalid",
    ".lan",
    ".local",
    ".localhost",
    ".test",
];

const parseInput = (input, allowBareDomain) => {
    if (input instanceof URL) return new URL(input.toString());
    if (typeof input !== "string") return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    try {
        return new URL(trimmed);
    } catch {
        if (!allowBareDomain || /[/?#@]/.test(trimmed)) return null;

        try {
            return new URL(`https://${trimmed}`);
        } catch {
            return null;
        }
    }
};

export const normalizePlatformDomain = (input, { allowBareDomain = true } = {}) => {
    const parsed = parseInput(input, allowBareDomain);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) return null;

    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");
    if (
        !hostname
        || hostname === "localhost"
        || isIP(hostname)
        || blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
    ) return null;

    const host = psl.parse(hostname);
    if (host.error || !host.domain) return null;

    const domain = host.domain.toLowerCase().replace(/\.+$/, "");
    if (!domain || isIP(domain)) return null;

    return {
        domain,
        homepageUrl: `https://${domain}/`,
    };
};
