import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O crawler e o cliente Postgres só rodam no servidor. Mantê-los fora do
  // bundle evita que o Next tente empacotar binários nativos do `postgres`.
  serverExternalPackages: ['postgres', 'cheerio'],
  typedRoutes: true,
}

export default nextConfig
