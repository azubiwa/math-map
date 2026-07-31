import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isGithubPages
    ? {
        output: "export",
        basePath: "/math-map",
        assetPrefix: "/math-map/",
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
