/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@fana/core"],
  webpack: (config) => {
    // @fana/core ships TS source with ESM-style ".js" specifiers; let webpack
    // resolve those to the .ts files (Node/tsx already do).
    config.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    return config;
  },
};

export default nextConfig;
