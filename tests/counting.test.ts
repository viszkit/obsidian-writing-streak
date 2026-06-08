import test from "node:test";
import assert from "node:assert/strict";
import { countMeaningfulWords, extractMeaningfulText } from "../src/counting";

test("frontmatter is excluded", () => {
	const content = [
		"---",
		"title: Example Title",
		"tags: [one, two]",
		"---",
		"Hello world",
	].join("\n");
	assert.equal(countMeaningfulWords(content), 2);
});

test("markdown formatting is excluded while text remains", () => {
	const content = "# Heading\nThis is **bold** and [linked text](https://example.com).";
	assert.equal(countMeaningfulWords(content), 7);
});

test("fenced code blocks are excluded", () => {
	const content = "Before\n```ts\nconst value = 10;\n```\nAfter";
	assert.equal(countMeaningfulWords(content), 2);
});

test("comments are excluded", () => {
	const content = "Visible %% hidden words %% text <!-- more hidden --> remains";
	assert.equal(countMeaningfulWords(content), 3);
});

test("unicode words are counted", () => {
	const content = "Grüße 東京 مرحبا";
	assert.equal(countMeaningfulWords(content), 4);
});

test("each Han character counts as one word", () => {
	assert.equal(countMeaningfulWords("你好世界"), 4);
});

test("Han characters combine with other words and numbers", () => {
	assert.equal(countMeaningfulWords("Hello你好世界 123"), 6);
	assert.equal(countMeaningfulWords("你好，世界！"), 4);
});

test("Han counting keeps Markdown exclusions", () => {
	const content = [
		"---",
		"title: 隐藏",
		"---",
		"[你好](https://example.com) %% 世界 %%",
		"```text",
		"代码",
		"```",
		"朋友",
	].join("\n");
	assert.equal(countMeaningfulWords(content), 4);
});

test("wikilink aliases preserve readable text", () => {
	const content = "See [[folder/note-name|Friendly Name]] soon";
	assert.equal(countMeaningfulWords(content), 4);
});

test("meaningful text extractor removes markdown syntax", () => {
	const content = "- Item with `code` and ~~style~~";
	assert.equal(extractMeaningfulText(content).includes("-"), false);
	assert.equal(countMeaningfulWords(content), 5);
});
