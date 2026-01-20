import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: "standalone",

  // 性能优化：优化包导入
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'framer-motion'],
  },

  // Webpack 优化
  webpack: (config, { dev }) => {
    if (!dev) {
      // 使用确定性模块 ID（更好的缓存）
      config.optimization.moduleIds = 'deterministic';
    }
    return config;
  },
};

// Bundle analyzer - 仅在 ANALYZE=true 时启用
// 使用方式: set ANALYZE=true && npm run build (Windows)
// 或: ANALYZE=true npm run build (Mac/Linux)
let exportedConfig = nextConfig;

if (process.env.ANALYZE === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: true });
  exportedConfig = withBundleAnalyzer(nextConfig);
}

export default exportedConfig;
