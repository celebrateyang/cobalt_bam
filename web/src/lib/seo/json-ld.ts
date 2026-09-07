/** Serialize JSON-LD without allowing page text to terminate the script tag. */
export const jsonLdScript = (value: unknown): string =>
    `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
