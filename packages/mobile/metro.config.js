const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// Monorepo root — two levels up from packages/mobile
const monorepoRoot = path.resolve(__dirname, '../..');

// pnpm virtual store — all symlinks in node_modules resolve here
const pnpmStore = 'C:\\pmv';

const config = {
  // Watch monorepo root and the pnpm virtual store (where symlinks point)
  watchFolders: [monorepoRoot, pnpmStore],

  resolver: {
    // Follow pnpm symlinks so Metro can read packages from the virtual store
    unstable_enableSymlinks: true,
    // Resolve workspace packages from the monorepo node_modules
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // Map @phonebridge/shared to its source so Metro can bundle it
    extraNodeModules: {
      '@phonebridge/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
