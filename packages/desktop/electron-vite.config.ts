import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

const sharedSrc = resolve(__dirname, '../shared/src/index.ts');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@phonebridge/shared'] })],
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
