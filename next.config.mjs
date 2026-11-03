/**
 * Static export for GitHub Pages (like the other analog-desk apps).
 * NEXT_PUBLIC_BASE_PATH is set by the deploy workflow to "/<repo-name>" for project pages.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};
export default nextConfig;
