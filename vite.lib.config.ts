import { viteStaticCopy } from 'vite-plugin-static-copy'
import { libInjectCss } from 'vite-plugin-lib-inject-css'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

import { resolve } from 'path'

export default defineConfig({
  plugins: [
    libInjectCss(),
    viteStaticCopy({
      targets: [
        { src: resolve(__dirname, 'package.json'), dest: '.' },
        { src: resolve(__dirname, 'README.md'), dest: '.' },
        { src: resolve(__dirname, 'LICENSE'), dest: '.' },
      ]
    }),
    dts({
      include: ['src'],
      exclude: ['src/demo/**/*'],
      outDir: 'dist',
      insertTypesEntry: true
    })
  ],
  build: {
    copyPublicDir: false,
    lib: {
      entry: {
        'container-manager': resolve(__dirname, 'src/index.ts'),
        'plugins': resolve(__dirname, 'src/plugins/index.ts'),
      },
      formats: ['es'],
      name: 'ContainerManager'
    },
    rollupOptions: {
      external: ['@alekstar79/reactive-event-system'],
      output: {
        globals: {
          '@alekstar79/reactive-event-system': 'ReactiveEventSystem'
        }
      }
    }
  }
})
