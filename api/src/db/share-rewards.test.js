import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { initPromotionSubmissionsDatabase } from "./promotion-submissions.js";
import { awardShareReward, isShareRewardRequest, listShareRewards } from "./share-rewards.js";

test("manual sharing rewards increment balances, keep history, replay safely and roll back on failure", async () => {
    const db = new PGlite();
    const query = (sql, values) => db.query(sql, values);
    const clientFactory = async () => ({ query, release() {} });
    try {
        await db.exec(`CREATE TABLE users(id int PRIMARY KEY, clerk_user_id text, points int NOT NULL, updated_at bigint);
            INSERT INTO users VALUES(1,'clerk_a',37,0),(2,'clerk_b',500,0);`);
        await initPromotionSubmissionsDatabase(query);
        const input = { userId: 1, requestId: randomUUID(), note: "WhatsApp screenshot reviewed", reviewer: "admin_a" };
        const first = await awardShareReward(input, clientFactory);
        assert.equal(first.points, 337);
        assert.equal(first.duplicate, false);
        const replay = await awardShareReward(input, clientFactory);
        assert.equal(replay.points, 337);
        assert.equal(replay.duplicate, true);
        assert.equal(replay.reward.id, first.reward.id);
        // A separate manual approval is permitted; no account-frequency policy.
        const second = await awardShareReward({ ...input, requestId: randomUUID() }, clientFactory);
        assert.equal(second.points, 637);
        const history = await listShareRewards(1, query);
        assert.equal(history.length, 2);
        assert.equal(history[0].awarded_points, 300);
        assert.equal(history[0].reviewed_by, "admin_a");
        assert.equal((await listShareRewards(2, query)).length, 0);
        assert.equal((await query("SELECT points FROM users WHERE id=2")).rows[0].points, 500);
        const missing = await awardShareReward({ ...input, userId: 99 }, clientFactory);
        assert.equal(missing.code, "USER_NOT_FOUND");
        const failedInput = { ...input, requestId: randomUUID() };
        const failingFactory = async () => ({ release() {}, query(sql, params) {
            if (sql.startsWith("UPDATE users SET")) throw new Error("simulated balance failure");
            return query(sql, params);
        } });
        await assert.rejects(awardShareReward(failedInput, failingFactory), /simulated balance failure/);
        assert.equal((await listShareRewards(1, query)).length, 2);
        assert.equal((await query("SELECT points FROM users WHERE id=1")).rows[0].points, 637);
        assert.equal((await awardShareReward(failedInput, clientFactory)).points, 937);
    } finally { await db.close(); }
});

test("rejects malformed approvals and missing proof notes", () => {
    const valid = { userId: 1, requestId: randomUUID(), note: "reviewed" };
    assert.equal(isShareRewardRequest(valid), true);
    for (const change of [{ userId: 0 }, { userId: 1.5 }, { requestId: "bad" }, { note: " " }, { note: "x".repeat(4001) }]) {
        assert.equal(isShareRewardRequest({ ...valid, ...change }), false);
    }
});
