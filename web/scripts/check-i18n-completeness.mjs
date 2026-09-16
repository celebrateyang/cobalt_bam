import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const i18nRoot = join(webRoot, 'i18n');
const baselineLocale = 'en';
const placeholderPattern = /(?<!{){[A-Za-z_][A-Za-z0-9_]*}(?!})|{{\s*[^{}]+?\s*}}|%[sdif]/g;
const mustBeLocalized = new Map([
    ['seo-runtime.json', new Set([
        'labels.toolsWithoutPoints',
        'labels.downloadGuide',
        'labels.corePages',
        'labels.similarDownloads',
    ])],
    ['faq.json', new Set([
        'actions.directory',
        'actions.guides',
        'actions.download_suffix',
    ])],
    ['random-chat.json', new Set([
        'action.report',
        'age.confirm_detail',
        'report.reason',
        'report.other',
        'safe.intro',
        'scenarios.intro',
    ])],
]);

async function listJsonFiles(root) {
    const files = [];

    async function walk(directory) {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile() && entry.name.endsWith('.json')) files.push(path);
        }
    }

    await walk(root);
    return files.sort();
}

function flatten(value, path = '', output = new Map()) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => flatten(item, `${path}[${index}]`, output));
    } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            flatten(item, path ? `${path}.${key}` : key, output);
        }
    } else {
        output.set(path, value);
    }

    return output;
}

function placeholders(value) {
    if (typeof value !== 'string') return [];
    return [...value.matchAll(placeholderPattern)]
        .map(([token]) => token.replace(/\s+/g, ''))
        .sort();
}

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

const localeEntries = await readdir(i18nRoot, { withFileTypes: true });
const locales = localeEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const baselineRoot = join(i18nRoot, baselineLocale);
const baselineFiles = await listJsonFiles(baselineRoot);
const baseline = new Map();

for (const path of baselineFiles) {
    baseline.set(relative(baselineRoot, path), flatten(await readJson(path)));
}

const failures = [];

for (const locale of locales) {
    if (locale === baselineLocale) continue;
    const localeRoot = join(i18nRoot, locale);

    for (const [file, expected] of baseline) {
        const localizedPath = join(localeRoot, file);
        let actual;

        try {
            actual = flatten(await readJson(localizedPath));
        } catch (error) {
            failures.push(`${locale}/${file}: ${error.code === 'ENOENT' ? 'missing file' : error.message}`);
            continue;
        }

        for (const [key, expectedValue] of expected) {
            if (!actual.has(key)) {
                failures.push(`${locale}/${file}:${key}: missing key`);
                continue;
            }

            const actualValue = actual.get(key);
            if (typeof actualValue !== typeof expectedValue) {
                failures.push(`${locale}/${file}:${key}: expected ${typeof expectedValue}, got ${typeof actualValue}`);
                continue;
            }

            if (key.endsWith('.path') && actualValue !== expectedValue) {
                failures.push(
                    `${locale}/${file}:${key}: route path must remain ${JSON.stringify(expectedValue)}`,
                );
            }

            if (
                mustBeLocalized.get(file)?.has(key) &&
                typeof expectedValue === 'string' &&
                actualValue === expectedValue
            ) {
                failures.push(`${locale}/${file}:${key}: still matches the English fallback`);
            }

            const expectedPlaceholders = placeholders(expectedValue);
            const actualPlaceholders = placeholders(actualValue);
            if (expectedPlaceholders.join('|') !== actualPlaceholders.join('|')) {
                failures.push(
                    `${locale}/${file}:${key}: placeholder mismatch ` +
                        `(${expectedPlaceholders.join(', ') || 'none'} vs ${actualPlaceholders.join(', ') || 'none'})`,
                );
            }
        }
    }
}

if (failures.length > 0) {
    console.error(`i18n completeness check failed with ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`i18n completeness check passed for ${locales.length} locales`);
