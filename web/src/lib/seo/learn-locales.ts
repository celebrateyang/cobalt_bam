import { supportedLanguages } from './language-routing';

export const localizedAlternativeSlugs = ['cobalt-tools-alternative', 'savefrom-alternative'] as const;
export const getLearnSeoLanguages = (slug?: string): readonly string[] =>
    !slug || localizedAlternativeSlugs.some((item) => item === slug) ? supportedLanguages : ['en'];
