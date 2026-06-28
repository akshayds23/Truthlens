/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow long-running API routes for fact-checking pipeline
  serverExternalPackages: ['pg', 'cheerio'],
};

module.exports = nextConfig;
