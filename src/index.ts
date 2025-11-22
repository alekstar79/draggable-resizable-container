// src/index.ts

/**
 * Main library entry point
 * Exports all public API for the container manager library
 */

export { ContainerManager } from './core/ContainerManager.ts'
export type {
  ContainerConfig,
  ContainerManagerInterface,
  ContainerManagerPlugin,
  ContainerEvent,
  ContainerState,
  Boundaries,
  MovementMode,
} from './core/types.ts'

// Export content creation utilities
export {
  type StateInterface,
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
} from './utils/helpers.ts'

export type { TemplateConfig } from './utils/templateLoader'

import './styles/base.css'
