/**
 * Utility exports for Container Manager library
 */

export { NotificationSystem, defaultNotificationSystem } from './notifications'
export { ContentCreator } from './contentCreator'
export { StatsManager } from './statsManager'

export type {
  TemplateConfig,
  TemplateLoadError,
  LoaderMetrics,
  TemplateSource
} from './templateLoader'

export {
  type StateInterface,
  clamp,
  clickOutside,
  debounce,
  deepMerge,
  extendedArray,
  extendedMap,
  getViewportDimensions,
  mapFromObject,
  isInViewport,
  getState,
  getStyles,
  pick
} from './helpers'

import {
  TemplateLoader,
  TemplateRegistry,
  TemplateCache,
  createDemoLoader,
  createLibraryLoader
} from './templateLoader'

let globalTemplateLoader: TemplateLoader

/**
 * System initialization (called in main.ts or app initialization)
 */
export async function initializeTemplateSystem(): Promise<TemplateLoader>
{
  if (globalTemplateLoader) return globalTemplateLoader

  const isDevMode =
    // @ts-ignore - Vite environment variable
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) ||
    (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development')

  if (isDevMode) {
    globalTemplateLoader = await createDemoLoader()
  } else {
    globalTemplateLoader = createLibraryLoader()

    globalTemplateLoader.registry.register({
      name: 'media',
      source: async () => {
        const res = await fetch('/templates/media.html')
        return res.text()
      },
      metadata: {
        version: '1.0',
        description: 'Media card',
        cached: true
      }
    })

    globalTemplateLoader.registry.register({
      name: 'userProfile',
      source: '<div class="user-profile"><h2>Profile</h2></div>',
      metadata: {
        version: '1.0',
        description: 'User profile card',
        cached: true
      }
    })
  }

  return globalTemplateLoader
}

/**
 * Get a global instance
 */
export function getTemplateLoader(): TemplateLoader
{
  if (!globalTemplateLoader) {
    throw new Error('Template system not initialized. Call initializeTemplateSystem() first.')
  }

  return globalTemplateLoader
}

export {
  TemplateCache,
  TemplateLoader,
  TemplateRegistry,
  createDemoLoader,
  createLibraryLoader
}
