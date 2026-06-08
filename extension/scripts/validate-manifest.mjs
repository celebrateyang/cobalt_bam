import { promises as fs } from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
const manifestPath = path.join(dist, 'manifest.json');
const issues = [];

const exists = async (relativePath) => {
    try {
        await fs.access(path.join(dist, relativePath));
        return true;
    } catch {
        return false;
    }
};

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) issues.push('manifest_version must be 3');
if (!manifest.name) issues.push('name is required');
if (!manifest.version) issues.push('version is required');
if (!manifest.action?.default_popup) issues.push('action.default_popup is required');
if (!manifest.background?.service_worker) issues.push('background.service_worker is required');
if (JSON.stringify(manifest).toLowerCase().includes('youtube downloader')) {
    issues.push('manifest must not advertise YouTube downloading');
}

const requiredFiles = [
    manifest.action.default_popup,
    manifest.background.service_worker,
    'assets/content.js',
    ...(manifest.content_scripts || []).flatMap((script) => script.js || []),
    ...Object.values(manifest.icons || {}),
];

if (manifest.host_permissions?.includes('<all_urls>')) {
    issues.push('avoid broad <all_urls> host_permissions for the MVP');
}

if (!manifest.permissions?.includes('scripting')) {
    issues.push('scripting permission is required for activeTab injection');
}

for (const file of requiredFiles) {
    if (!(await exists(file))) issues.push(`missing packaged file: ${file}`);
}

if (issues.length) {
    console.error(`Extension validation failed: ${issues.length} issue(s)`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
} else {
    console.log('Extension manifest validation passed');
}
