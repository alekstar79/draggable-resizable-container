// src/plugins/SnappingPlugin.ts

import type { ContainerManagerInterface, ContainerManagerPlugin, ContainerState } from '../core/types'
import { reactive } from '@alekstar79/reactive-event-system'

/**
 * Configuration options for SnappingPlugin
 */
export interface SnappingPluginOptions {
  snapStep?: number
  enabled?: boolean
}

/**
 * Extended container manager interface with plugin methods
 */
export interface ExtendedContainerManager extends ContainerManagerInterface {
  setSnapStep?(step: number): void
  setSnappingEnabled?(enabled: boolean): void
  getSnappingConfig?(): SnappingPluginOptions
}

export interface ContainerManagerWithSnapping extends ContainerManagerInterface {
  setSnapStep?(step: number): void
  setSnappingEnabled?(enabled: boolean): void
  getSnappingConfig?(): SnappingPluginOptions
}

/**
 * Reactive state for snapping plugin
 */
interface SnappingPluginState {
  snapStep: number
  enabled: boolean
  isActive: boolean
  lastPosition: { x: number; y: number } | null
}

/**
 * Snapping plugin for Container Manager
 */
export class SnappingPlugin implements ContainerManagerPlugin
{
  // Plugin state
  private reactiveState = reactive<SnappingPluginState>({
    snapStep: 10,
    enabled: true,
    isActive: false,
    lastPosition: null
  })

  private manager?: ContainerManagerInterface
  private startX: number = 0
  private startY: number = 0
  private startState: ContainerState | null = null

  constructor(options: SnappingPluginOptions = {})
  {
    // Initialize with options
    this.reactiveState.snapStep = options.snapStep ?? 10
    this.reactiveState.enabled = options.enabled ?? true

    this.onDragMove = this.onDragMove.bind(this)
    this.onDragEnd = this.onDragEnd.bind(this)
  }

  /**
   * Install plugin on container manager instance with reactive state
   */
  install(manager: ContainerManagerInterface, options?: SnappingPluginOptions): void
  {
    this.manager = manager

    // Update configuration if provided during installation
    if (options) {
      this.reactiveState.snapStep = options.snapStep ?? this.reactiveState.snapStep
      this.reactiveState.enabled = options.enabled ?? this.reactiveState.enabled
    }

    // Override drag handling methods
    this.overrideDragMethods()
    // Add plugin methods to manager for dynamic control
    this.addPluginMethods(manager)
  }

  /**
   * Override drag handling methods to add snapping functionality
   */
  private overrideDragMethods(): void
  {
    if (!this.manager) return

    // Create new drag handle with snapping support
    const dragHandle = this.manager.getContainer().querySelector('.drag-handle') as HTMLElement
    if (dragHandle) {
      // Add our own event listeners
      dragHandle.onmousedown = (e: MouseEvent) => {
        this.onDragStart(e)
      }

      // Add touch support
      dragHandle.ontouchstart = (e: TouchEvent) => {
        this.onDragStart(e)
      }
    }
  }

  /**
   * Handle drag start event with snapping support
   */
  private onDragStart(e: MouseEvent | TouchEvent): void
  {
    if (!this.manager || this.manager.getMode() === 'pinned') return

    e.preventDefault()
    this.manager.bringToFront()

    // Update state
    this.reactiveState.isActive = true

    const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX
    const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY

    this.startX = clientX
    this.startY = clientY
    this.startState = this.manager.getState()

    // Store last position
    this.reactiveState.lastPosition = { x: this.startState.x, y: this.startState.y }

    // Add event listeners for drag movement and end
    document.addEventListener('mousemove', this.onDragMove)
    document.addEventListener('mouseup', this.onDragEnd)
    document.addEventListener('touchmove', this.onDragMove)
    document.addEventListener('touchend', this.onDragEnd)

    this.manager.emitPluginEvent('dragStart', {
      type: 'drag',
      state: this.startState,
      mode: this.manager.getMode()
    })
  }

  /**
   * Handle drag movement with reactive snapping
   */
  private onDragMove(e: MouseEvent | TouchEvent): void
  {
    if (!this.reactiveState.isActive || !this.manager || !this.startState) return

    const { clientX, clientY } = this.manager.directionResolver(
      e instanceof MouseEvent ? e.clientX : e.touches[0].clientX,
      e instanceof MouseEvent ? e.clientY : e.touches[0].clientY
    )

    let deltaX = clientX - this.startX
    let deltaY = clientY - this.startY

    // Apply snapping if enabled
    if (this.reactiveState.enabled) {
      const snappedDeltas = this.applySnapping(deltaX, deltaY)
      deltaX = snappedDeltas.deltaX
      deltaY = snappedDeltas.deltaY
    }

    const newState: ContainerState = {
      x: this.startState.x + deltaX,
      y: this.startState.y + deltaY,
      width: this.startState.width,
      height: this.startState.height
    }

    // Constrain to viewport if enabled
    const config = (this.manager as any).config
    if (config?.constrainToViewport) {
      this.constrainToViewport(newState)
    }

    this.manager.setState(newState)

    // Update last position
    this.reactiveState.lastPosition = { x: newState.x, y: newState.y }

    this.manager.emitPluginEvent('drag', {
      type: 'drag',
      state: newState,
      mode: this.manager.getMode()
    })
  }

  /**
   * Handle drag end event
   */
  private onDragEnd(): void
  {
    if (!this.manager) return

    // Update state
    this.reactiveState.isActive = false
    this.reactiveState.lastPosition = null
    this.startState = null

    // Remove event listeners
    document.removeEventListener('mousemove', this.onDragMove)
    document.removeEventListener('mouseup', this.onDragEnd)
    document.removeEventListener('touchmove', this.onDragMove)
    document.removeEventListener('touchend', this.onDragEnd)

    this.manager.emitPluginEvent('dragEnd', {
      type: 'drag',
      state: this.manager.getState(),
      mode: this.manager.getMode()
    })
  }

  /**
   * Apply snapping to drag movement based on current mode
   */
  private applySnapping(deltaX: number, deltaY: number): { deltaX: number; deltaY: number }
  {
    // Use reactive snapStep
    return {
      deltaX: this.snapToGrid(deltaX, this.reactiveState.snapStep),
      deltaY: this.snapToGrid(deltaY, this.reactiveState.snapStep)
    }
  }

  /**
   * Snap value to grid using reactive step
   */
  private snapToGrid(value: number, step: number): number
  {
    return Math.round(value / step) * step
  }

  /**
   * Constrain container to viewport boundaries
   */
  private constrainToViewport(state: ContainerState): void
  {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight

    state.x = Math.max(0, Math.min(state.x, viewportWidth - state.width))
    state.y = Math.max(0, Math.min(state.y, viewportHeight - state.height))
  }

  /**
   * Add plugin methods to container manager
   */
  private addPluginMethods(manager: ExtendedContainerManager): void
  {
    // Methods that update reactive state
    manager.setSnapStep = (step: number): void => {
      this.reactiveState.snapStep = step
      manager.emitPluginEvent('snapStepChanged', { snapStep: step })
    }

    manager.setSnappingEnabled = (enabled: boolean): void => {
      this.reactiveState.enabled = enabled
      manager.emitPluginEvent('snappingEnabledChanged', { enabled })
    }

    manager.getSnappingConfig = (): SnappingPluginOptions => {
      return {
        snapStep: this.reactiveState.snapStep,
        enabled: this.reactiveState.enabled
      }
    }
  }

  /**
   * Get current plugin state for debugging
   */
  getState(): SnappingPluginState
  {
    return { ...this.reactiveState }
  }

  /**
   * Clean up plugin resources
   */
  destroy(): void
  {
    // Clean up reactive state
    this.reactiveState.isActive = false
    this.reactiveState.lastPosition = null
  }
}
