import { publicConfig } from './config';
/** Internal routes (static export → query strings instead of dynamic segments). Use with next/link (basePath is added automatically). */
export const locHref = (ref: string) => `/location?id=${encodeURIComponent(ref)}`;
/** For raw <a>/window.location usage, where Next doesn't add the basePath. */
export const withBase = (path: string) => `${publicConfig.basePath}${path}`;
