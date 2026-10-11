// Unsupported or malformed ranges are ignored; valid but unsatisfiable
// single ranges receive 416. Multiple ranges are intentionally unsupported.
export const resolveByteRange = (header, size) => {
    if (typeof header !== "string") return null;
    const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
    if (!match || (!match[1] && !match[2])) return null;
    let start, end;
    if (!match[1]) {
        const suffix = BigInt(match[2]);
        if (suffix === 0n || size === 0n) return { unsatisfiable: true };
        start = suffix >= size ? 0n : size - suffix;
        end = size - 1n;
    } else {
        start = BigInt(match[1]);
        end = match[2] ? BigInt(match[2]) : size - 1n;
        if (match[2] && end < start) return null;
        if (start >= size) return { unsatisfiable: true };
        if (end >= size) end = size - 1n;
    }
    return { start, end };
};
