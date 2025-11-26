// src/index.ts

/**
 * Main library entry point
 * Exports all public API for the container manager library
 */

export { ContainerManager } from './core/ContainerManager'
export type {
  ContainerConfig,
  ContainerManagerInterface,
  Plugin,
  ContainerEvent,
  ContainerState,
  Boundaries,
  MovementMode,
} from './core/types.ts'

// Export content creation utilities
export {
  type StateInterface,
  ContainerInitializer,
  TemplateLoader,
  ContentCreator
} from './utils'

// Export utility functions
export {
  clamp,
  clickOutside,
  debounce,
  deepMerge,
  extendedArray,
  extendedMap,
  getViewportDimensions,
  mapFromObject,
  isInViewport
} from './utils/helpers'

export type { TemplateConfig } from './utils/TemplateLoader.ts'

// Re-export from external dependencies
export {
  ref,
  reactive,
  computed,
  effect,
  watch,
  batch,
} from '@alekstar79/reactivity'

import './styles/base.css'
