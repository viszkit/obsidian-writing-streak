import { strict as assert } from "node:assert";
import test from "node:test";
import { normalizeHexColor } from "../src/color";

test("normalizeHexColor keeps normalized lowercase hex colours", () => {
	assert.equal(normalizeHexColor("#aabbcc"), "#aabbcc");
});

test("normalizeHexColor accepts hex colours without a leading hash", () => {
	assert.equal(normalizeHexColor("AABBCC"), "#aabbcc");
});

test("normalizeHexColor rejects invalid hex colours", () => {
	assert.equal(normalizeHexColor("#abc"), null);
	assert.equal(normalizeHexColor("blue"), null);
	assert.equal(normalizeHexColor("#gggggg"), null);
	assert.equal(normalizeHexColor(""), null);
});
