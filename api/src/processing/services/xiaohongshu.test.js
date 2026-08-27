import assert from "node:assert/strict";
import test from "node:test";

import { isUnavailableRedirectUrl } from "./xiaohongshu.js";

test("recognizes Xiaohongshu unavailable redirects", () => {
    assert.equal(
        isUnavailableRedirectUrl("https://www.xiaohongshu.com/404"),
        true,
    );
    assert.equal(
        isUnavailableRedirectUrl(
            "https://www.xiaohongshu.com/explore?target_note_id=note123&undertake_note_error=unavailable",
        ),
        true,
    );
    assert.equal(
        isUnavailableRedirectUrl("https://www.xiaohongshu.com/explore/note123"),
        false,
    );
});
