#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const decoder = new TextDecoder("utf-8", { fatal: true });
const i18nRoot = path.resolve(process.cwd(), "i18n");

const suspiciousFragments = ["锟", "鎴", "馃", "脳", "\uFFFD"];
const scriptMatchers = {
    zh: /[\p{Script=Han}]/u,
    ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
    ko: /[\p{Script=Hangul}]/u,
    ru: /[\p{Script=Cyrillic}]/u,
    th: /[\p{Script=Thai}]/u,
};

/** @type {Array<{file:string,key?:string,message:string,sample?:string}>} */
const issues = [];

const walkJsonFiles = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await walkJsonFiles(full)));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith(".json")) {
            files.push(full);
        }
    }

    return files;
};

const addIssue = (file, message, key, sample) => {
    issues.push({ file, message, key, sample });
};

const isTextKey = (keyPath) =>
    /(desc|description|title|subtitle|label|text)$/i.test(keyPath);

const looksLikeSentence = (value) =>
    typeof value === "string" && value.length >= 8 && /[\s,.!?，。！？]/.test(value);

const collectStringIssues = (locale, file, node, keyPath = "") => {
    if (typeof node === "string") {
        if (node.includes("\uFFFD")) {
            addIssue(file, "contains Unicode replacement character U+FFFD", keyPath, node);
        }

        for (const frag of suspiciousFragments) {
            if (frag === "\uFFFD") continue;
            if (node.includes(frag)) {
                addIssue(file, `contains suspicious mojibake fragment "${frag}"`, keyPath, node);
            }
        }

        if (isTextKey(keyPath)) {
            const qCount = (node.match(/\?/g) || []).length;
            if (qCount >= 3 || node.includes("??")) {
                addIssue(
                    file,
                    "contains suspicious repeated '?' (possible encoding corruption)",
                    keyPath,
                    node,
                );
            }

            const matcher = scriptMatchers[locale];
            if (
                matcher &&
                looksLikeSentence(node) &&
                qCount > 0 &&
                !matcher.test(node)
            ) {
                addIssue(
                    file,
                    `text looks corrupted for locale "${locale}" (missing expected script characters)`,
                    keyPath,
                    node,
                );
            }
        }

        return;
    }

    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
            collectStringIssues(locale, file, node[i], `${keyPath}[${i}]`);
        }
        return;
    }

    if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
            const nextPath = keyPath ? `${keyPath}.${k}` : k;
            collectStringIssues(locale, file, v, nextPath);
        }
    }
};

const main = async () => {
    const files = await walkJsonFiles(i18nRoot);

    for (const file of files) {
        const rel = path.relative(i18nRoot, file).replaceAll("\\", "/");
        const locale = rel.split("/")[0];

        let raw;
        try {
            raw = await fs.readFile(file);
        } catch (error) {
            addIssue(file, `failed to read file: ${error.message}`);
            continue;
        }

        let text = "";
        try {
            text = decoder.decode(raw);
        } catch (error) {
            addIssue(file, `invalid UTF-8 byte sequence: ${error.message}`);
            continue;
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            addIssue(file, `invalid JSON: ${error.message}`);
            continue;
        }

        collectStringIssues(locale, file, parsed);
    }

    if (issues.length === 0) {
        console.log("i18n encoding check passed");
        return;
    }

    console.error(`i18n encoding check failed: ${issues.length} issue(s) found`);
    for (const issue of issues) {
        const relFile = path.relative(process.cwd(), issue.file).replaceAll("\\", "/");
        const keyPart = issue.key ? ` [${issue.key}]` : "";
        console.error(`- ${relFile}${keyPart}: ${issue.message}`);
        if (issue.sample) {
            const escaped = issue.sample.replace(/\s+/g, " ").slice(0, 140);
            console.error(`  sample: ${escaped}`);
        }
    }

    process.exitCode = 1;
};

main().catch((error) => {
    console.error("i18n encoding check crashed:", error);
    process.exitCode = 1;
});
