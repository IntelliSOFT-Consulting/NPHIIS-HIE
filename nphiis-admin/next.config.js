/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  output: 'standalone',
  basePath: '/admin',
  assetPrefix: '/admin',
}

module.exports = nextConfig
