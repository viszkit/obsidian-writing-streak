"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_COUNT_OPTIONS = void 0;
exports.extractMeaningfulText = extractMeaningfulText;
exports.countMeaningfulWords = countMeaningfulWords;
exports.DEFAULT_COUNT_OPTIONS = {
    excludeFrontmatter: true,
    excludeComments: true,
    excludeCodeBlocks: true,
};
let wordMatcher = null;
function getWordMatcher() {
    if (wordMatcher)
        return wordMatcher;
    try {
        wordMatcher = /[\p{L}\p{N}]+(?:[-_'’][\p{L}\p{N}]+)*/gu;
    }
    catch {
        wordMatcher = /[A-Za-z0-9]+(?:[-_'’][A-Za-z0-9]+)*/g;
    }
    return wordMatcher;
}
function removeFrontmatterByMetadata(content, metadata) {
    const typedMetadata = metadata;
    const position = typedMetadata?.frontmatterPosition ?? typedMetadata?.frontmatter?.position;
    const start = position?.start?.offset;
    const end = position?.end?.offset;
    if (typeof start === "number" && typeof end === "number" && start >= 0 && end > start) {
        return `${content.slice(0, start)}${content.slice(end)}`;
    }
    if (!content.startsWith("---\n") && !content.startsWith("---\r\n"))
        return content;
    const normalized = content.replace(/\r\n/g, "\n");
    const closingIndex = normalized.indexOf("\n---\n", 4);
    if (closingIndex === -1)
        return content;
    return normalized.slice(closingIndex + 5);
}
function removeComments(content) {
    return content
        .replace(/%%[\s\S]*?%%/g, " ")
        .replace(/<!--[\s\S]*?-->/g, " ");
}
function removeCodeBlocks(content) {
    return content.replace(/(^|\n)```[\s\S]*?\n```(?=\n|$)/g, "$1");
}
function replaceMarkdownLinks(content) {
    return content
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ")
        .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
        const text = alias ?? target.split("/").pop() ?? target;
        return ` ${text.replace(/\.[^.]+$/, "")} `;
    })
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
        const text = alias ?? target.split("/").pop() ?? target;
        return ` ${text.replace(/\.[^.]+$/, "")} `;
    });
}
function stripMarkdownSyntax(content) {
    let stripped = content;
    stripped = replaceMarkdownLinks(stripped);
    stripped = stripped.replace(/^\s{0,3}(#{1,6}|>|[-*+] |\d+\. )/gm, "");
    stripped = stripped.replace(/`([^`]+)`/g, " $1 ");
    stripped = stripped.replace(/\|/g, " ");
    stripped = stripped.replace(/[*_~]/g, " ");
    stripped = stripped.replace(/<[^>]+>/g, " ");
    stripped = stripped.replace(/\^\[[^\]]+\]/g, " ");
    stripped = stripped.replace(/\{#[^}]+\}/g, " ");
    stripped = stripped.replace(/!?(?=\[\])/g, " ");
    return stripped;
}
function extractMeaningfulText(content, metadata, options = exports.DEFAULT_COUNT_OPTIONS) {
    let meaningful = content;
    if (options.excludeFrontmatter) {
        meaningful = removeFrontmatterByMetadata(meaningful, metadata);
    }
    if (options.excludeComments) {
        meaningful = removeComments(meaningful);
    }
    if (options.excludeCodeBlocks) {
        meaningful = removeCodeBlocks(meaningful);
    }
    meaningful = stripMarkdownSyntax(meaningful);
    return meaningful;
}
function countMeaningfulWords(content, metadata, options = exports.DEFAULT_COUNT_OPTIONS) {
    const meaningful = extractMeaningfulText(content, metadata, options);
    const matches = meaningful.match(getWordMatcher());
    return matches?.length ?? 0;
}
