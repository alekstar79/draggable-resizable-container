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
      outDir: 'dist',
      include: ['src/**/*'],
      exclude: ['src/demo/**/*', 'src/test/**/*'],
      insertTypesEntry: true
    })
  ],
  build: {
    copyPublicDir: false,
    lib: {
      // entry: {
      //   'container-manager': resolve(__dirname, 'src/index.ts'),
      //   'plugins': resolve(__dirname, 'src/plugins/index.ts'),
      // },
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ContainerManager',
      formats: ['es', 'umd'],
      fileName: (format, entryName) => {
        console.log({  format, entryName })
        return `index.${format}.js`
      }
    },
    rollupOptions: {
      external: [
        '@alekstar79/reactive-event-system',
        '@alekstar79/reactivity'
      ],
      output: {
        globals: {
          '@alekstar79/reactive-event-system': 'ReactiveEventSystem',
          '@alekstar79/reactivity': 'reactivity',
        }
      }
    },
    sourcemap: true,
    minify: 'esbuild'
  }
})
