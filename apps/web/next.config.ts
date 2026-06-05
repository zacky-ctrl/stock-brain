import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@stock-brain/domain',
    '@stock-brain/ui',
    '@stock-brain/types',
    '@stock-brain/utils',
  ],
}

export default nextConfig
