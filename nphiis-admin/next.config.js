/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: __dirname,
  },
}

module.exports = nextConfig
