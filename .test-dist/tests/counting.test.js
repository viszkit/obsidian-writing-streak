"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const counting_1 = require("../src/counting");
(0, node_test_1.default)("frontmatter is excluded", () => {
    const content = [
        "---",
        "title: Example Title",
        "tags: [one, two]",
        "---",
        "Hello world",
    ].join("\n");
    strict_1.default.equal((0, counting_1.countMeaningfulWords)(content), 2);
});
(0, node_test_1.default)("markdown formatting is excluded while text remains", () => {
    const content = "# Heading\nThis is **bold** and [linked text](https://example.com).";
    strict_1.default.equal((0, counting_1.countMeaningfulWords)(content), 7);
});
(0, node_test_1.default)("fenced code blocks are excluded", () => {
    const content = "Before\n```ts\nconst value = 10;\n```\nAfter";
    strict_1.default.equal((0, counting_1.countMeaningfulWords)(content), 2);
});
(0, node_test_1.default)("comments are excluded", () => {
    const content = "Visible %% hidden words %% text <!-- more hidden --> remains";
    strict_1.default.equal((0, counting_1.countMeaningfulWords)(content), 3);
});
(0, node_test_1.default)("unicode words are counted", () => {
    const content = "Grüße 東京 مرحبا";
    strict_1.default.equal((0, counting_1.countMeaningfulWords)(content), 3);
});
(0, node_test_1.default)("wikilink aliases preserve readable text", () => {
    const content = "See [[folder/note-name|Friendly Name]] soon";
    strict_1.default.equal((0, counting_1.countMeaningfulWords)(content), 4);
});
(0, node_test_1.default)("meaningful text extractor removes markdown syntax", () => {
    const content = "- Item with `code` and ~~style~~";
    strict_1.default.equal((0, counting_1.extractMeaningfulText)(content).includes("-"), false);
    strict_1.default.equal((0, counting_1.countMeaningfulWords)(content), 5);
});
