/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Lesson photos are stored as base64 data URIs (no separate file
    // storage backend), which inflates size ~33% over the compressed
    // JPEG — the default 1MB server action body limit is too tight.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
