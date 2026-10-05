// Public discovery metadata. Runtime services, prices and limits come from the API.
export const personalAgentDiscovery = {
    supported: true,
    documentationUrl: 'https://freesavevideo.online/agents',
    managementUrl: 'https://freesavevideo.online/en/account/agents',
    capabilitiesUrl: 'https://api.freesavevideo.online/agent/v1/capabilities',
    openApiUrl: 'https://api.freesavevideo.online/agent/openapi.json',
    mcpUrl: 'https://api.freesavevideo.online/agent/mcp',
    operations: ['get_capabilities', 'get_balance', 'resolve_media'],
    authentication: 'User-created scoped bearer credential; custom header support required for MCP.',
    automaticRecharge: false,
} as const;

export const agentDiscoveryLinkHeader = [
    '</agents>; rel="help"; type="text/html"; title="AI agent access: REST and MCP"',
    '</llms.txt>; rel="help"; type="text/plain"; title="AI agent discovery summary"',
    '</capabilities.json>; rel="help"; type="application/json"; title="Site capabilities"',
].join(', ');
