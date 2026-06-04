export const supportedSeoLanguages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'] as const;

export type SupportedSeoLanguage = (typeof supportedSeoLanguages)[number];

export const defaultSeoLanguage: SupportedSeoLanguage = 'en';

export const canonicalHost = 'freesavevideo.online';

export const canonicalOrigin = `https://${canonicalHost}`;

export const publicNoindexPaths = [
    '/account',
    '/settings',
    '/history',
    '/invite',
    '/donate',
    '/updates',
    '/console-manage-2025',
] as const;

export const machineReadablePaths = [
    '/capabilities.json',
    '/llms.txt',
    '/llms-full.txt',
    '/llm.txt',
    '/.well-known/llms.txt',
] as const;

