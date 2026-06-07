import { strict as assert } from "node:assert";
import test from "node:test";
import { getOverachieverColors, normalizeHexColor } from "../src/color";

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

test("overachiever colors preserve a strong border for light themes", () => {
	const colors = getOverachieverColors("#f472b6");

	assert.equal(colors["--wg-overachiever-edge"], "#f472b6");
	assert.equal(colors["--wg-overachiever-border-strong"], "rgba(244, 114, 182, 0.95)");
	assert.equal(colors["--wg-overachiever-glow"], "rgba(244, 114, 182, 0.75)");
});
