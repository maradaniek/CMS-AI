import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["nspell", "dictionary-nl", "is-buffer"],
  outputFileTracingIncludes: {
    "*": ["./node_modules/dictionary-nl/**/*", "./node_modules/nspell/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
