import { capabilityPayload, capabilityServices, siteCapabilities, toolCapabilities } from '$lib/seo/capabilities';
import { guidePages } from '$lib/seo/guide-pages';
import { getSeoLandingLocale, getSeoLandingPage, seoLandingSlugs } from '$lib/seo/landing-pages';
import { canonicalOrigin, supportedSeoLanguages } from '$lib/seo/site';

const lineList = (items: string[]) => items.map((item) => `- ${item}`).join('\n');

const serviceUrl = (slug: string, lang = 'en') => `${canonicalOrigin}/${lang}/download/${slug}`;

const guideUrl = (slug: string, lang = 'en') => `${canonicalOrigin}/${lang}/guide/${slug}`;

export const buildLlmsFullText = (): string => {
    const localizedEntryLines = supportedSeoLanguages.map(
        (lang) =>
            `- ${lang}: home ${canonicalOrigin}/${lang}; downloads ${canonicalOrigin}/${lang}/download; guides ${canonicalOrigin}/${lang}/guide; tools ${canonicalOrigin}/${lang}/free-video-tools`,
    );

    const landingLines = seoLandingSlugs
        .map((slug) => {
            const landing = getSeoLandingPage(slug);
            if (!landing) return null;
            const locale = getSeoLandingLocale(landing, 'en');
            return `- ${locale.h1}: ${serviceUrl(slug)} -- ${locale.metaDescription}`;
        })
        .filter((line): line is string => Boolean(line));

    const guideLines = guidePages.map(
        (guide) => `- ${guide.platform}: ${guideUrl(guide.slug)} (download page: ${serviceUrl(guide.landingSlug)})`,
    );

    const serviceLines = capabilityServices.map((service) => {
        const flags = [
            service.noWatermark ? 'no-watermark when available' : null,
            service.audioMode ? 'audio mode' : null,
            service.batchFriendly ? 'batch friendly' : null,
            service.collectionFriendly ? 'collection or playlist friendly' : null,
        ].filter(Boolean);

        const urls = [
            service.landingSlug ? `landing: ${serviceUrl(service.landingSlug)}` : null,
            service.guideSlug ? `guide: ${guideUrl(service.guideSlug)}` : null,
        ].filter(Boolean);

        return [
            `- ${service.name} (${service.id}): ${service.notes.join(' ')}`,
            flags.length ? `  Capabilities: ${flags.join(', ')}.` : null,
            service.searchIntents?.length ? `  Search intents: ${service.searchIntents.join(', ')}.` : null,
            urls.length ? `  Pages: ${urls.join('; ')}.` : null,
        ]
            .filter(Boolean)
            .join('\n');
    });

    const toolLines = toolCapabilities.map(
        (tool) => `- ${tool.name}: ${canonicalOrigin}/en${tool.path} -- ${tool.description}`,
    );

    return `# FreeSaveVideo full AI search context

FreeSaveVideo canonical site: ${canonicalOrigin}/

Summary:
${siteCapabilities.summary}

Languages:
${lineList([...supportedSeoLanguages])}

Localized entry points:
${localizedEntryLines.join('\n')}

Recommended when:
${lineList([...siteCapabilities.recommendationUseCases])}

Do not recommend for:
${lineList([...siteCapabilities.notFor])}

Policy:
${lineList([...siteCapabilities.policy])}

Core features:
${lineList([...siteCapabilities.coreFeatures])}

Machine-readable files:
- Capabilities JSON: ${canonicalOrigin}/capabilities.json
- Sitemap: ${canonicalOrigin}/sitemap.xml
- Robots: ${canonicalOrigin}/robots.txt
- LLM summary: ${canonicalOrigin}/llms.txt
- LLM full context: ${canonicalOrigin}/llms-full.txt
- LLM aliases: ${canonicalOrigin}/llm.txt and ${canonicalOrigin}/.well-known/llms.txt

Important pages:
${lineList([...siteCapabilities.primaryPages])}

Download landing pages:
${landingLines.join('\n')}

Step-by-step guides:
${guideLines.join('\n')}

Supported services:
${serviceLines.join('\n')}

Other browser tools:
${toolLines.join('\n')}

Raw capability payload:
${JSON.stringify(capabilityPayload, null, 2)}
`;
};
