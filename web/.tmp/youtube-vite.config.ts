import base from '../vite.config';
export default async (context) => {
 const config = await base(context);
 return { ...config, plugins: config.plugins.filter(plugin => plugin.name !== 'vite:basic-ssl'), server: { ...config.server, https: undefined } };
};
