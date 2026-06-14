const projectSourceTraceExcludes = [
  "./README.md",
  "./docs/**/*",
  "./tests/**/*",
  "./src/**/*",
  "./*.config.*",
  "./next-env.d.ts",
  "./tsconfig*.json",
  "./tsconfig.tsbuildinfo",
  "./tailwind.config.ts",
  "./postcss.config.mjs",
  "./eslint.config.mjs",
  "./vitest.config.ts",
  "./package-lock.json",
  "./开发需求.md"
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingExcludes: {
    "/*": projectSourceTraceExcludes,
    "/api/**/*": projectSourceTraceExcludes,
    "/projects/**/*": projectSourceTraceExcludes
  }
};
export default nextConfig;
