/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@basketball-clipper/shared"],
  experimental: {},
};

export default nextConfig;
