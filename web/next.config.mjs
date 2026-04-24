/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@basketball-clipper/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
