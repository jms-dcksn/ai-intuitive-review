/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Run instrumentation.ts at server startup (wires AI SDK telemetry → LangSmith).
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
