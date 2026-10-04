import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import i18n from 'sveltekit-i18n';
import { get } from 'svelte/store';

const root = new URL('../i18n/', import.meta.url);
let checked = 0;
for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = new URL(`${entry.name}/auth.json`, root);
    let auth;
    try { auth = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const translations = new i18n({
        fallbackLocale: entry.name,
        translations: { [entry.name]: { auth } },
    });
    await translations.loadTranslations(entry.name, '/account');
    const t = get(translations.t);
    for (const [key, payload, expected] of [
        ['bmc_buy', { count: 2000, price: 'US$4.99' }, ['2000', 'US$4.99']],
        ['download_pass_buy', { days: 30, price: 'US$4.99' }, ['30', 'US$4.99']],
        ['download_pass_terms', { days: 30 }, ['30']],
    ]) {
        const output = t(`auth.${key}`, payload);
        assert.ok(output && output !== `auth.${key}`, `${entry.name}: missing ${key}`);
        assert.ok(!/[{}]/.test(output), `${entry.name}: unresolved placeholder in ${key}: ${output}`);
        for (const value of expected) assert.ok(output.includes(value), `${entry.name}: missing ${value} in ${key}: ${output}`);
    }
    checked++;
}
assert.equal(checked, 11);
console.log(`BMC translation interpolation passed for ${checked} locales`);
