import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Previne que auth/prisma sejam bundlados pelo webpack no servidor
  // (evita o falso-positivo do <Html> do @auth/core)
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "@auth/core",
    "@auth/prisma-adapter",
    "next-auth",
    "bcryptjs",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
