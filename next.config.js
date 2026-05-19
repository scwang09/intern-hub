/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["mammoth", "xlsx"],
  },
};

module.exports = nextConfig;
