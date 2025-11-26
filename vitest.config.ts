// draggable-resizeable-container/vitest.config.ts

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/demo/',
        'src/test/',
        '**/*.d.ts'
      ]
    }
  }
})
