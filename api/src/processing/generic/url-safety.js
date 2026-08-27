import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

const BLOCKED_HOSTNAME_SUFFIXES = [
    ".home",
    ".internal",
    ".lan",
    ".local",
    ".localhost",
];

const ALLOWED_PORTS = new Set(["", "80", "443"]);

const normalizeAddress = (value) => {
    const address = ipaddr.parse(value);
    return address.kind() === "ipv6" && address.isIPv4MappedAddress()
        ? address.toIPv4Address()
        : address;
};

export const isPublicAddress = (value) => {
    try {
        return normalizeAddress(value).range() === "unicast";
    } catch {
        return false;
    }
};

export const parseSafeGenericURL = (value) => {
    let parsed;
    try {
        parsed = value instanceof URL ? new URL(value.toString()) : new URL(String(value));
    } catch {
        return null;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    if (!ALLOWED_PORTS.has(parsed.port)) return null;

    const hostname = parsed.hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, "")
        .replace(/\.+$/, "");
    if (
        !hostname
        || hostname === "localhost"
        || isIP(hostname)
        || BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    ) return null;

    return parsed;
};

export const validateGenericURL = async (value, resolver = lookup) => {
    const parsed = parseSafeGenericURL(value);
    if (!parsed) return false;

    let addresses;
    try {
        addresses = await resolver(parsed.hostname, { all: true, verbatim: true });
    } catch {
        return false;
    }

    return (
        Array.isArray(addresses)
        && addresses.length > 0
        && addresses.every(({ address }) => isPublicAddress(address))
    );
};
