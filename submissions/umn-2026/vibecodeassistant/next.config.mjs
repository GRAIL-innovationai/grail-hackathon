/** @type {import('next').NextConfig} */
const config = {
  webpack(config) {
    // The teammate's NodeNext module uses .js imports in TypeScript source.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default config;
