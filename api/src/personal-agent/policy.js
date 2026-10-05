import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const grantSchema = z.object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(z.enum(["balance:read", "media:resolve"])).min(1).max(2).transform(v => [...new Set(v)]),
    expiresInDays: z.number().int().min(1).max(30).default(7),
    dailyCalls: z.number().int().min(1).max(100).default(10),
    maxPointsPerCall: z.number().int().min(0).max(1000).default(0),
    allowMembership: z.boolean().default(false),
}).strict();
export const resolveSchema = z.object({
    url: z.string().url().max(4096).refine(value => {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    }, "An HTTP(S) media URL without credentials is required"),
    downloadMode: z.enum(["auto", "audio", "mute"]).default("auto"),
    videoQuality: z.enum(["1080", "720", "480", "360", "240", "144"]).default("720"),
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
}).strict();
export const agentError = (code, status = 400, context) => Object.assign(new Error(code), { code, status, context });
export const tokenHash = value => createHash("sha256").update(value).digest("hex");
export const newToken = () => `fsv_agent_${randomBytes(32).toString("base64url")}`;
export const queueIdentity = (grantId, key) => `agent_${tokenHash(`${grantId}:${key}`)}`;

// Recheck authorization immediately before existing billing sends any media URLs.
export const checkChargePermission = async ({ grant, points, membership, isActive }) => {
    if (!await isActive()) throw agentError("AGENT_AUTH_REVOKED", 403);
    if (membership) {
        if (!grant.allow_membership) throw agentError("AGENT_MEMBERSHIP_NOT_ALLOWED", 403);
    } else if (points > grant.max_points_per_call) {
        throw agentError("AGENT_POINT_LIMIT", 403, { required: points, maximum: grant.max_points_per_call });
    }
};
