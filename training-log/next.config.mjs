import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives inside a repo that has its own lockfile, so point Turbopack
  // at the app directory rather than letting it walk up.
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
}

export default nextConfig
