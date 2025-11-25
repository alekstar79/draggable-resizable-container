// src/core/types.ts

import ReactiveEventSystem from "@alekstar79/reactive-event-system"

/**
 * Container movement modes
 */
export type MovementMode = 'smooth' | 'pinned'

/**
 * Container movement directions
 */
export type DirectionMode = 'all' | 'horizontal' | 'vertical'

/**
 * Resize direction types
 */
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * Auto-adjustment configuration for parent element
 */
export interface AutoAdjustConfig {
  enabled?: boolean
  width?: boolean
  height?: boolean
}

/**
 * Container boundaries configuration
 */
export interface Boundaries {
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

/**
 * Resize configuration
 */
export interface ResizeConfig {
  enabled?: boolean
  directions?: ResizeDirection[]
}

/**
 * Configuration options for container manager
 */
export interface ContainerConfig {
  _uid: string
  mode: MovementMode
  boundaries: Boundaries
  draggingDirection: DirectionMode
  constrainToViewport: boolean
  constrainToParent?: boolean
  autoAdjust?: AutoAdjustConfig
  resize?: ResizeConfig
}

/**
 * Container position and dimensions
 */
export interface ContainerState {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Event payload for container changes
 */
export interface ContainerEvent {
  type: 'drag' | 'resize' | 'modeChange' | 'viewportResize' | 'autoAdjust' | 'parentRecalculated' | 'stateChange'
  state: ContainerState
  mode: MovementMode
  direction?: ResizeDirection
  element: HTMLElement
}

export interface PluginMiddleware {
  (data: any, event: string): any
}

/**
 * Base plugin interface that all plugins must implement
 */
export interface Plugin {
  pluginId: Symbol

  /**
   * Install plugin on container manager instance
   * @param instance - ContainerManager instance implementing ContainerManagerInterface
   * @param options - Plugin configuration options
   */
  install(instance: ContainerManagerInterface, options?: any): void
  destroy?(): void
}

/**
 * Container Manager class interface for plugins
 */
export interface ContainerManagerInterface {
  // Basic management and configuration methods
  getMode(): MovementMode
  setMode(mode: MovementMode): void
  getState(): ContainerState
  setState(state: Partial<ContainerState>): void
  getDirection(): DirectionMode
  setDirection(direction: DirectionMode): void
  setAutoAdjust(config: AutoAdjustConfig): void
  setResizeConfig(config: ResizeConfig): void
  setConstrainToParent(enabled: boolean): void
  setConstrainToViewport(enabled: boolean): void
  directionResolver(x: number, y: number): { clientX: number; clientY: number }
  recalculateForParent(): void
  setBoundaries(boundaries: Partial<Boundaries>): void
  getContainer(): HTMLElement
  bringToFront?(): void
  destroy?(): void

  // Event methods
  on(event: string, callback: (data: ContainerEvent) => void): void
  off(event: string, callback: (data: ContainerEvent) => void): void
  waitFor(event: string, timeout?: number): Promise<ContainerEvent>
  getStream(event: string): ReturnType<ReactiveEventSystem<ContainerEvent>['stream']>
  pipe(event: string, targetEmitter: ReactiveEventSystem<ContainerEvent>, targetEvent?: string): () => void
  getEventMetrics(): ReturnType<ReactiveEventSystem<ContainerEvent>['getMetrics']>

  onDragStart(e: MouseEvent | TouchEvent): void
  onDragMove(e: MouseEvent | TouchEvent): void
  onDragEnd(): void

  onResizeStart(e: MouseEvent | TouchEvent, direction: ResizeDirection): void
  onResizeMove(e: MouseEvent | TouchEvent): void
  onResizeEnd(): void

  // Plugin management
  emitPluginEvent(event: string, data: any): void
  onPluginEvent(event: string, listener: Function): void
  offPluginEvent(event: string, listener: Function): void
  usePluginMiddleware(event: string, middleware: PluginMiddleware): () => void
  use(plugin: Plugin, options?: any): ContainerManagerInterface
  hasPlugin(plugin: Plugin): boolean
  getInstalledPlugins(): Plugin[]

  [p: string]: any
}
