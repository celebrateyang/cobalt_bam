import assert from "node:assert/strict";
import test from "node:test";
import { matchBuyMeACoffeeAccount } from "./buymeacoffee-account.js";

test("requires one exact verified Clerk account and one enabled local account", async () => {
    const profile = { id: "user_test", emailAddresses: [{ emailAddress: "buyer@example.com", verification: { status: "verified" } }] };
    let profiles = { totalCount: 1, data: [profile] };
    let users = [{ id: 1, clerk_user_id: "user_test", is_disabled: false }];
    const deps = {
        clerkUsers: { getUserList: async args => { assert.deepEqual(args.emailAddress, ["buyer@example.com"]); return profiles; } },
        query: async () => ({ rows: users }),
    };
    const match = () => matchBuyMeACoffeeAccount(" Buyer@Example.com ", deps);
    assert.equal((await match()).user.id, 1);
    profiles = { totalCount: 2, data: [profile] };
    assert.equal((await match()).code, "EMAIL_AMBIGUOUS");
    profiles = { totalCount: 0, data: [] };
    assert.equal((await match()).code, "EMAIL_ACCOUNT_NOT_FOUND");
    profiles = { totalCount: 1, data: [profile] };
    profile.emailAddresses[0].verification.status = "unverified";
    assert.equal((await match()).code, "EMAIL_NOT_VERIFIED");
    profile.emailAddresses[0].verification.status = "verified";
    profile.emailAddresses[0].emailAddress = "buyer+other@example.com";
    assert.equal((await match()).code, "EMAIL_NOT_VERIFIED");
    profile.emailAddresses[0].emailAddress = "buyer@example.com";
    users = [...users, { id: 2, clerk_user_id: "another_user" }];
    assert.equal((await match()).code, "EMAIL_AMBIGUOUS");
    users = [{ id: 1, clerk_user_id: "user_test", is_disabled: true }];
    assert.equal((await match()).code, "ACCOUNT_DISABLED");
    assert.equal((await matchBuyMeACoffeeAccount("", deps)).code, "PAYMENT_EMAIL_MISSING");
});
