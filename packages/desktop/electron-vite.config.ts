import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

const sharedSrc = resolve(__dirname, '../shared/src/index.ts');

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Bundle all pure-JS deps into main process so they work in the packaged app.
        // Only truly native modules that need node-gyp builds stay external.
        exclude: [
          '@phonebridge/shared',
          'qrcode',
          'ws',
          'express',
          'bonjour-service',
          'uuid',
        ],
      }),
    ],
    resolve: {
      alias: {
        '@phonebridge/shared': sharedSrc,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@phonebridge/shared'] })],
    resolve: {
      alias: {
        '@phonebridge/shared': sharedSrc,
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@phonebridge/shared': sharedSrc,
      },
    },
  },
});
