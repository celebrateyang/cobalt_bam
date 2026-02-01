// Remux relies on browser-only APIs (File, Web Workers, WASM assets)
// and cannot be rendered/prerendered in a Node.js environment.
export const ssr = false;
export const prerender = false;
