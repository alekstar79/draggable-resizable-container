import { dirname, extname, resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import generateFile from 'vite-plugin-generate-file'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: resolve(__dirname, 'public'),
  plugins: [
    viteStaticCopy({
      targets: [{
        src: resolve(__dirname, 'src/demo/templates/*'),
        dest: './templates'
      }]
    }),
    generateFile([{
      type: 'raw',
      output: './.gitignore',
      data: '*\n!.gitignore'
    }])
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    },
    extensions: ['.js', '.ts']
  },
  build: {
    outDir: resolve(__dirname, 'demo'),
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        entryFileNames: 'assets/main.js',
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'index') {
            const entryModule = chunkInfo.moduleIds[chunkInfo.moduleIds.length - 1]
            const segments = dirname(entryModule).split('/')
            const segment = segments[segments.length - 1]

            chunkInfo.name = segment

            return `assets/component-${segment}.js`
          }

          return 'assets/[name].js'
        },
        assetFileNames: (assetInfo) => {
          if (!assetInfo.names?.[0]) return ''

          const extType = extname(assetInfo.names[0])

          if (extType === '.css') {
            return 'assets/css/[name][extname]'
          }
          if (['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'].includes(extType)) {
            return 'assets/images/[name][extname]'
          }
          if (['.woff', '.woff2', '.ttf'].includes(extType)) {
            return 'assets/fonts/[name][extname]'
          }

          return 'assets/[name][extname]'
        }
      }
    }
  },
  server: {
    open: true,
    port: 3000,
  }
})
