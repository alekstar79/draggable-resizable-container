// src/core/ContainerManager.ts

import { type StateInterface, clamp, deepMerge, getState, getViewportDimensions } from '../utils'
import { computed, effect, reactive } from '@alekstar79/reactive-event-system'
import ReactiveEventSystem from '@alekstar79/reactive-event-system'
import {
  AutoAdjustConfig,
  Boundaries,
  ContainerManagerInterface,
  Plugin,
  ContainerConfig,
  ContainerEvent,
  ContainerState,
  DirectionMode,
  MovementMode,
  PluginMiddleware,
  ResizeConfig,
  ResizeDirection
} from './types'

/**
 * Main container management class for drag and resize operations
 * Implements ContainerManagerInterface for plugin compatibility
 * Now with reactive state management using @alekstar79/reactivity
 */
export class ContainerManager implements ContainerManagerInterface
{
  // Streams for reactive event handling
  private dragStream: ReturnType<ReactiveEventSystem<ContainerEvent>['stream']>
  private resizeStream: ReturnType<ReactiveEventSystem<ContainerEvent>['stream']>
  private readonly stateChangeStream: ReturnType<ReactiveEventSystem<ContainerEvent>['stream']>
  private readonly eventEmitter: ReactiveEventSystem<ContainerEvent>
  private readonly pluginEventEmitter: ReactiveEventSystem

  private readonly config: ContainerConfig
  private readonly container: HTMLElement
  private dragHandle!: HTMLElement
  private resizeHandles: Map<ResizeDirection, HTMLElement> = new Map()
  private installedPlugins: Set<Plugin> = new Set()
  private reactiveEffects: (() => void)[] = []

  private isDragging: boolean = false
  private isResizing: boolean = false
  private resizeDirection: ResizeDirection | null = null
  private startX: number = 0
  private startY: number = 0
  private startState: ContainerState
  private resizeObserver: ResizeObserver | null = null
  private parentResizeObserver: ResizeObserver | null = null
  public zIndexState: StateInterface

  private reactiveState = reactive({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    mode: 'smooth' as MovementMode,
    draggingDirection: 'all' as DirectionMode
  })

  // Computed state with applied constraints
  private constrainedState = computed(() => {
    const state = this.reactiveState

    if (!this.config) {
      return { ...state }
    }

    let constrained: ContainerState = { ...state }

    // Apply boundaries constraints
    const { boundaries } = this.config
    constrained.width = clamp(
      state.width,
      boundaries.minWidth || 10,
      boundaries.maxWidth || Infinity
    )
    constrained.height = clamp(
      state.height,
      boundaries.minHeight || 10,
      boundaries.maxHeight || Infinity
    )

    // Apply viewport constraints if needed
    if (this.shouldConstrainToViewport()) {
      const viewport = getViewportDimensions()
      constrained.x = clamp(state.x, 0, viewport.width - constrained.width)
      constrained.y = clamp(state.y, 0, viewport.height - constrained.height)
    }

    // Apply parent constraints if enabled
    if (this.config?.constrainToParent) {
      constrained = this.constrainToParent(constrained)
    }

    return constrained
  })

  // Automatic DOM updates with reactive effect
  private domUpdateEffect = effect(() => {
    const state = this.constrainedState.value

    if (!this.container) return

    this.container.style.left = `${state.x}px`
    this.container.style.top = `${state.y}px`
    this.container.style.width = `${state.width}px`
    this.container.style.height = `${state.height}px`

    this.eventEmitter?.emit('stateChange', {
      type: 'stateChange',
      state: { ...state },
      mode: this.reactiveState.mode
    })
  })

  /**
   * Create a new container manager instance with reactive state management
   * @param container - HTML element to manage
   * @param config - Configuration options
   */
  constructor(container: HTMLElement, config: Partial<ContainerConfig> = {})
  {
    this.config = deepMerge<ContainerConfig>({
      _uid: '',
      mode: 'smooth',
      boundaries: { minWidth: 300, minHeight: 45 },
      constrainToViewport: false,
      draggingDirection: 'all',
      constrainToParent: false,
      autoAdjust: {
        enabled: false,
        width: false,
        height: false
      },
      resize: {
        enabled: true,
        directions: ['se']
      }
    }, config)

    this.container = container
    this.zIndexState = getState()

    // Initialize reactive state from DOM
    const currentState = this.getCurrentState()
    this.reactiveState.x = currentState.x
    this.reactiveState.y = currentState.y
    this.reactiveState.width = currentState.width
    this.reactiveState.height = currentState.height
    this.reactiveState.mode = this.config.mode
    this.reactiveState.draggingDirection = this.config.draggingDirection

    // Initialize enhanced event emitters with metrics
    this.eventEmitter = new ReactiveEventSystem<ContainerEvent>({ enableMetrics: true })
    this.pluginEventEmitter = new ReactiveEventSystem({ enableMetrics: true })

    // Create reactive streams for common events
    this.stateChangeStream = this.eventEmitter.stream('stateChange')
    this.dragStream = this.eventEmitter.stream('drag')
    this.resizeStream = this.eventEmitter.stream('resize')

    this.startState = this.getState()

    this.setupEventMiddleware()
    this.initializeHandles()
    this.bindEvents()
    this.setupResizeObservers()
    this.setupReactiveMonitoring()
  }

  /**
   * Set up ResizeObserver to track viewport and parent size changes
   */
  private setupResizeObservers(): void
  {
    // Setup viewport resize observer if viewport constraints should be applied
    if (this.shouldConstrainToViewport()) {
      this.setupViewportResizeObserver()
    }

    // Setup parent element observer if auto-adjust is enabled
    if (this.config.autoAdjust?.enabled) {
      this.setupParentResizeObserver()
    }
  }

  /**
   * Determine if viewport constraints should be applied
   */
  private shouldConstrainToViewport(): boolean
  {
    return !this.config.constrainToParent || this.config.constrainToViewport
  }

  /**
   * Set up ResizeObserver to track viewport size changes
   */
  private setupViewportResizeObserver(): void
  {
    let rAFTimeout: number | null = null

    this.resizeObserver = new ResizeObserver(() => {
      rAFTimeout && cancelAnimationFrame(rAFTimeout)
      rAFTimeout = requestAnimationFrame(() => {
        this.handleViewportResize()
      })
    })

    this.resizeObserver.observe(document.body)
  }

  /**
   * Handle viewport resize event with reactive state updates
   */
  private handleViewportResize(): void
  {
    if (!this.shouldConstrainToViewport()) return

    const viewport = getViewportDimensions()
    const currentState = this.getState()
    const newState = { ...currentState }

    let needsUpdate = false

    // Check if container is outside viewport on right edge
    if (newState.x + newState.width > viewport.width) {
      newState.x = Math.max(0, viewport.width - newState.width)
      needsUpdate = true
    }

    // Check if container is outside viewport on bottom edge
    if (newState.y + newState.height > viewport.height) {
      newState.y = Math.max(0, viewport.height - newState.height)
      needsUpdate = true
    }

    // Check if container is outside viewport on left edge
    if (newState.x < 0) {
      newState.x = 0
      needsUpdate = true
    }

    // Check if container is outside viewport on top edge
    if (newState.y < 0) {
      newState.y = 0
      needsUpdate = true
    }

    if (needsUpdate) {
      // Use reactive state update which will automatically apply constraints
      this.setState(newState)

      this.eventEmitter.emit('viewportResize', {
        type: 'viewportResize',
        state: this.getState(),
        mode: this.reactiveState.mode
      })
    }
  }

  /**
   * Set up ResizeObserver for parent element auto-adjustment
   */
  private setupParentResizeObserver(): void
  {
    const parentElement = this.container.parentElement
    if (!parentElement) return

    this.parentResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.handleParentResize(entry)
      }
    })

    this.parentResizeObserver.observe(parentElement)
  }

  /**
   * Handle parent element resize for auto-adjustment with reactive updates
   */
  private handleParentResize(entry: ResizeObserverEntry): void
  {
    const { autoAdjust } = this.config
    if (!autoAdjust?.enabled) return

    const parentRect = entry.contentRect
    const currentState = this.getState()
    const newState = { ...currentState }

    let needsUpdate = false

    if (autoAdjust.width) {
      const maxWidth = this.getMaxWidthConstraint()
      const newWidth = Math.min(parentRect.width, maxWidth)

      if (Math.abs(newState.width - newWidth) > 1) {
        newState.width = newWidth
        needsUpdate = true
      }
    }

    if (autoAdjust.height) {
      const maxHeight = this.getMaxHeightConstraint()
      const newHeight = Math.min(parentRect.height, maxHeight)

      if (Math.abs(newState.height - newHeight) > 1) {
        newState.height = newHeight
        needsUpdate = true
      }
    }

    if (needsUpdate) {
      // Reactive state update
      this.setState(newState)

      this.eventEmitter.emit('autoAdjust', {
        type: 'autoAdjust',
        state: this.getState(),
        mode: this.reactiveState.mode
      })
    }
  }

  /**
   * Initialize drag and resize handles based on configuration
   */
  private initializeHandles(): void
  {
    this.initializeDragHandle()

    if (this.config.resize?.enabled) {
      this.initializeResizeHandles()
    }
  }

  /**
   * Initialize drag handle
   */
  private initializeDragHandle(): void
  {
    this.dragHandle = this.container.querySelector('[data-drag-handle]') as HTMLElement
    if (!this.dragHandle) {
      this.dragHandle = document.createElement('div')
      this.dragHandle.className = 'drag-handle'
      this.dragHandle.setAttribute('data-drag-handle', 'true')
      this.dragHandle.setAttribute('oncontextmenu', 'return false')
      this.container.prepend(this.dragHandle)
    } else {
      this.dragHandle.setAttribute('oncontextmenu', 'return false')
    }
  }

  /**
   * Initialize resize handles for all configured directions
   */
  private initializeResizeHandles(): void
  {
    const directions = this.config.resize?.directions || ['se']

    directions.forEach(direction => {
      const handle = this.createResizeHandle(direction)
      this.resizeHandles.set(direction, handle)
      this.container.appendChild(handle)
    })
  }

  /**
   * Create individual resize handle for specific direction
   */
  private createResizeHandle(direction: ResizeDirection): HTMLElement
  {
    const handle = document.createElement('div')
    handle.className = `resize-handle resize-${direction}`
    handle.setAttribute('data-resize-handle', direction)
    handle.setAttribute('data-resize-direction', direction)

    // Add context menu prevention for resize handles
    handle.addEventListener('contextmenu', this.onContextMenu)

    this.applyResizeHandleStyles(handle, direction)

    return handle
  }

  /**
   * Apply styles and cursor for resize handle based on direction
   */
  private applyResizeHandleStyles(handle: HTMLElement, direction: ResizeDirection): void
  {
    const cursorMap: Record<ResizeDirection, string> = {
      'n': 'ns-resize', 's': 'ns-resize', 'e': 'ew-resize', 'w': 'ew-resize',
      'ne': 'nesw-resize', 'nw': 'nwse-resize', 'se': 'nwse-resize', 'sw': 'nesw-resize'
    }

    handle.style.position = 'absolute'
    handle.style.cursor = cursorMap[direction]

    this.positionResizeHandle(handle, direction)
  }

  /**
   * Position resize handle based on direction
   */
  private positionResizeHandle(handle: HTMLElement, direction: ResizeDirection): void
  {
    const size = 12

    switch (direction) {
      case 'n':
        handle.style.top = '0'
        handle.style.left = '0'
        handle.style.right = '0'
        handle.style.height = `${size}px`
        break
      case 's':
        handle.style.bottom = '0'
        handle.style.left = '0'
        handle.style.right = '0'
        handle.style.height = `${size}px`
        break
      case 'e':
        handle.style.right = '0'
        handle.style.top = '0'
        handle.style.bottom = '0'
        handle.style.width = `${size}px`
        break
      case 'w':
        handle.style.left = '0'
        handle.style.top = '0'
        handle.style.bottom = '0'
        handle.style.width = `${size}px`
        break
      case 'ne':
        handle.style.top = '0'
        handle.style.right = '0'
        handle.style.width = `${size}px`
        handle.style.height = `${size}px`
        break
      case 'nw':
        handle.style.top = '0'
        handle.style.left = '0'
        handle.style.width = `${size}px`
        handle.style.height = `${size}px`
        break
      case 'se':
        handle.style.bottom = '0'
        handle.style.right = '0'
        handle.style.width = `${size}px`
        handle.style.height = `${size}px`
        break
      case 'sw':
        handle.style.bottom = '0'
        handle.style.left = '0'
        handle.style.width = `${size}px`
        handle.style.height = `${size}px`
        break
    }
  }

  /**
   * Bind event listeners to handles
   */
  private bindEvents(): void
  {
    this.onDragStart = this.onDragStart.bind(this)
    this.onDragMove = this.onDragMove.bind(this)
    this.onDragEnd = this.onDragEnd.bind(this)

    this.onResizeStart = this.onResizeStart.bind(this)
    this.onResizeMove = this.onResizeMove.bind(this)
    this.onResizeEnd = this.onResizeEnd.bind(this)

    this.onContextMenu = this.onContextMenu.bind(this)

    // Only bind default drag events if no snapping plugin is installed
    if (!this.hasPluginByName('SnappingPlugin')) {
      this.dragHandle.addEventListener('mousedown', this.onDragStart)
      this.dragHandle.addEventListener('touchstart', this.onDragStart)
    }

    // Bind resize events for all resize handles
    if (this.config.resize?.enabled) {
      this.resizeHandles.forEach((handle, direction) => {
        handle.addEventListener('mousedown', (e) => this.onResizeStart(e, direction))
        handle.addEventListener('touchstart', (e) => this.onResizeStart(e, direction))
      })
    }

    // Disable context menu on drag handle
    this.dragHandle.addEventListener('contextmenu', this.onContextMenu)
  }

  /**
   * Apply movement mode to coordinates
   */
  private applyMovementMode(deltaX: number, deltaY: number): ContainerState
  {
    const newState = { ...this.startState }

    if (this.reactiveState.mode === 'smooth') {
      newState.x = this.startState.x + deltaX
      newState.y = this.startState.y + deltaY
    }

    return newState
  }

  /**
   * Calculate new state based on resize direction and deltas
   */
  private calculateResizeState(deltaX: number, deltaY: number, direction: ResizeDirection): ContainerState
  {
    const newState = { ...this.startState }

    switch (direction) {
      case 'e': // East - right only
        newState.width = this.startState.width + deltaX
        break
      case 'w': // West - left only
        newState.width = this.startState.width - deltaX
        newState.x = this.startState.x + deltaX
        break
      case 'n': // North - top only
        newState.height = this.startState.height - deltaY
        newState.y = this.startState.y + deltaY
        break
      case 's': // South - bottom only
        newState.height = this.startState.height + deltaY
        break
      case 'ne': // Northeast - top-right
        newState.width = this.startState.width + deltaX
        newState.height = this.startState.height - deltaY
        newState.y = this.startState.y + deltaY
        break
      case 'nw': // Northwest - top-left
        newState.width = this.startState.width - deltaX
        newState.height = this.startState.height - deltaY
        newState.x = this.startState.x + deltaX
        newState.y = this.startState.y + deltaY
        break
      case 'se': // Southeast - bottom-right
        newState.width = this.startState.width + deltaX
        newState.height = this.startState.height + deltaY
        break
      case 'sw': // Southwest - bottom-left
        newState.width = this.startState.width - deltaX
        newState.height = this.startState.height + deltaY
        newState.x = this.startState.x + deltaX
        break
    }

    return newState
  }

  /**
   * Constrain container to parent element boundaries (both position and size)
   */
  private constrainToParent(state: ContainerState): ContainerState
  {
    const parentElement = this.container.parentElement
    if (!parentElement) return state

    const parentRect = parentElement.getBoundingClientRect()

    // If the container has not yet been added to the DOM or the parent has a zero size,
    // return to the original state
    if (parentRect.width === 0 || parentRect.height === 0) {
      return state
    }

    // Calculating the maximum allowable coordinates
    const maxX = Math.max(0, parentRect.width - state.width)
    const maxY = Math.max(0, parentRect.height - state.height)

    // Calculating the maximum allowable sizes
    const maxWidth = parentRect.width - state.x
    const maxHeight = parentRect.height - state.y

    return {
      x: clamp(state.x, 0, maxX),
      y: clamp(state.y, 0, maxY),
      width: clamp(state.width, 0, maxWidth),
      height: clamp(state.height, 0, maxHeight)
    }
  }

  /**
   * Get maximum width constraint considering parent and boundaries
   */
  private getMaxWidthConstraint(): number
  {
    const { boundaries } = this.config
    let maxWidth = boundaries.maxWidth || Infinity

    if (this.config.constrainToParent && this.container.parentElement) {
      const parentWidth = this.container.parentElement.getBoundingClientRect().width
      maxWidth = Math.min(maxWidth, parentWidth)
    }

    return maxWidth
  }

  /**
   * Get maximum height constraint considering parent and boundaries
   */
  private getMaxHeightConstraint(): number
  {
    const { boundaries } = this.config
    let maxHeight = boundaries.maxHeight || Infinity

    if (this.config.constrainToParent && this.container.parentElement) {
      const parentHeight = this.container.parentElement.getBoundingClientRect().height
      maxHeight = Math.min(maxHeight, parentHeight)
    }

    return maxHeight
  }

  /**
   * Handle context menu event on drag handle
   */
  private onContextMenu(e: MouseEvent): void
  {
    e.preventDefault()
    e.stopPropagation()
  }

  /**
   * Check if snapping plugin is installed
   */
  private hasPluginByName(pluginName: string): boolean
  {
    return Array.from(this.installedPlugins)
      .some(plugin => plugin.constructor.name === pluginName)
  }

  /**
   * Get current container state from DOM
   */
  private getCurrentState(): ContainerState
  {
    const rect = this.container.getBoundingClientRect()
    const style = window.getComputedStyle(this.container)

    return {
      x: parseInt(style.left) || 0,
      y: parseInt(style.top) || 0,
      width: rect.width,
      height: rect.height
    }
  }

  /**
   * Setup event middleware for enhanced event processing
   */
  private setupEventMiddleware(): void
  {
    // Add logging middleware for all events
    this.eventEmitter.use('*', (data, event) => {
      if (typeof window !== 'undefined' && (window as any).DEBUG_CONTAINER_MANAGER) {
        console.log(`[ContainerManager] ${event}:`, data)
      }
      return data
    })

    // TODO Add validation middleware for drag events
    this.eventEmitter.use('dragStart', (data, _event) => {
      if (this.reactiveState.mode === 'pinned') {
        throw new Error('Cannot drag in pinned mode')
      }
      return data
    })

    // Add performance monitoring middleware
    this.eventEmitter.use('drag', (data, _event) => {
      // console.log(`[ContainerManager] ${event}:`, data)
      return data
    })
  }

  /**
   * Setup reactive monitoring for container metrics
   */
  private setupReactiveMonitoring(): void
  {
    // Monitor state changes reactively
    const stateMonitor = effect(() => {
      const { state } = this.stateChangeStream
      // Intentional side-effect-free access
      // We don't need to do anything here
      void state
    })

    this.reactiveEffects.push(stateMonitor)

    // Monitor emitter metrics
    const metricsMonitor = effect(() => {
      const metrics = this.eventEmitter.getMetrics()
      // Monitor event system health
      if (metrics.state.errorCount > 10) {
        console.warn('[ContainerManager] High error count in event system:', metrics.state.errorCount)
      }
    })

    this.reactiveEffects.push(metricsMonitor)
  }

  // Public API Implementation

  /**
   * Subscribe to container events
   * @param event - Event name
   * @param callback - Callback function
   */
  on(event: string, callback: (data: ContainerEvent) => void): void
  {
    this.eventEmitter.on(event, callback)
  }

  /**
   * Unsubscribe from container events
   * @param event - Event name
   * @param callback - Callback function
   */
  off(event: string, callback: (data: ContainerEvent) => void): void
  {
    this.eventEmitter.off(event, callback)
  }

  /**
   * Wait for specific container event
   * @example
   * // Wait for drag to complete
   * const dragResult = await manager.waitFor('dragEnd')
   * console.log('Drag completed:', dragResult.state)
   */
  waitFor(event: string, timeout?: number): Promise<ContainerEvent>
  {
    return this.eventEmitter.waitFor(event, timeout)
  }

  /**
   * Get reactive stream for specific event type
   * @example
   * // Get state change stream
   * const stateStream = manager.getStream('stateChange')
   * stateStream.subscribe((data) => {
   *   console.log('State changed:', data.state)
   * })
   */
  getStream(event: string): ReturnType<ReactiveEventSystem<ContainerEvent>['stream']>
  {
    return this.eventEmitter.stream(event)
  }

  /**
   * Pipe container events to another emitter
   * @example
   * // Pipe all events to analytics emitter
   * manager.pipe('*', analyticsEmitter)
   */
  pipe(event: string, targetEmitter: ReactiveEventSystem<ContainerEvent>, targetEvent?: string): () => void
  {
    return this.eventEmitter.pipe(event, targetEmitter, targetEvent)
  }

  /**
   * Get event system metrics for monitoring
   */
  getEventMetrics(): ReturnType<ReactiveEventSystem<ContainerEvent>['getMetrics']>
  {
    return this.eventEmitter.getMetrics()
  }

  /**
   * Plugin-specific event emission
   */
  emitPluginEvent(event: string, data: any): void
  {
    this.pluginEventEmitter.emit(event, data)
  }

  /**
   * Listen to plugin-specific events
   */
  onPluginEvent(event: string, listener: (data: any) => void): void
  {
    this.pluginEventEmitter.on(event, listener)
  }

  /**
   * Remove plugin event listener
   */
  offPluginEvent(event: string, listener: (data: any) => void): void
  {
    this.pluginEventEmitter.off(event, listener)
  }

  /**
   * Add middleware for plugin events
   */
  usePluginMiddleware(event: string, middleware: PluginMiddleware): () => void
  {
    return this.pluginEventEmitter.use(event, middleware)
  }

  /**
   * Handle drag start event
   */
  onDragStart(e: MouseEvent | TouchEvent): void
  {
    // Don't allow dragging in pinned mode
    if (this.reactiveState.mode === 'pinned') return

    e.preventDefault()
    this.bringToFront()

    this.isDragging = true

    const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX
    const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY

    this.startX = clientX
    this.startY = clientY
    this.startState = this.getState()

    this.eventEmitter.emit('dragStart', {
      type: 'drag',
      state: this.getState(),
      mode: this.reactiveState.mode
    })

    document.addEventListener('mousemove', this.onDragMove)
    document.addEventListener('mouseup', this.onDragEnd)
    document.addEventListener('touchmove', this.onDragMove)
    document.addEventListener('touchend', this.onDragEnd)
  }

  /**
   * Handle drag movement with reactive state updates
   */
  onDragMove(e: MouseEvent | TouchEvent): void
  {
    if (!this.isDragging) return

    const { clientX, clientY } = this.directionResolver(
      e instanceof MouseEvent ? e.clientX : e.touches[0].clientX,
      e instanceof MouseEvent ? e.clientY : e.touches[0].clientY
    )

    const deltaX = clientX - this.startX
    const deltaY = clientY - this.startY

    // Apply movement mode and update reactive state
    const newState = this.applyMovementMode(deltaX, deltaY)
    this.setState(newState)

    this.eventEmitter.emit('drag', {
      type: 'drag',
      state: this.getState(),
      mode: this.reactiveState.mode
    })
  }

  /**
   * Handle drag end event
   */
  onDragEnd(): void
  {
    this.isDragging = false

    document.removeEventListener('mousemove', this.onDragMove)
    document.removeEventListener('mouseup', this.onDragEnd)
    document.removeEventListener('touchmove', this.onDragMove)
    document.removeEventListener('touchend', this.onDragEnd)

    this.eventEmitter.emit('dragEnd', {
      type: 'drag',
      state: this.getState(),
      mode: this.reactiveState.mode
    })
  }

  /**
   * Handle resize start event with direction
   */
  onResizeStart(e: MouseEvent | TouchEvent, direction: ResizeDirection): void
  {
    e.preventDefault()
    e.stopPropagation()

    this.bringToFront()
    this.isResizing = true
    this.resizeDirection = direction

    const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX
    const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY

    this.startX = clientX
    this.startY = clientY
    this.startState = this.getState()

    document.addEventListener('mousemove', this.onResizeMove)
    document.addEventListener('mouseup', this.onResizeEnd)
    document.addEventListener('touchmove', this.onResizeMove)
    document.addEventListener('touchend', this.onResizeEnd)

    this.eventEmitter.emit('resizeStart', {
      type: 'resize',
      state: this.getState(),
      mode: this.reactiveState.mode,
      direction
    })
  }

  /**
   * Handle resize movement with multi-direction support and reactive updates
   */
  onResizeMove(e: MouseEvent | TouchEvent): void
  {
    if (!this.isResizing || !this.resizeDirection) return

    const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX
    const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY

    const deltaX = clientX - this.startX
    const deltaY = clientY - this.startY

    const newState = this.calculateResizeState(deltaX, deltaY, this.resizeDirection)

    // Use reactive state update which will automatically apply constraints
    this.setState(newState)

    this.eventEmitter.emit('resize', {
      type: 'resize',
      state: this.getState(),
      mode: this.reactiveState.mode,
      direction: this.resizeDirection
    })
  }

  /**
   * Handle resize end event
   */
  onResizeEnd(): void
  {
    this.isResizing = false
    this.resizeDirection = null

    document.removeEventListener('mousemove', this.onResizeMove)
    document.removeEventListener('mouseup', this.onResizeEnd)
    document.removeEventListener('touchmove', this.onResizeMove)
    document.removeEventListener('touchend', this.onResizeEnd)

    this.eventEmitter.emit('resizeEnd', {
      type: 'resize',
      state: this.getState(),
      mode: this.reactiveState.mode
    })
  }

  /**
   * Set movement direction
   */
  setDirection(direction: DirectionMode): void
  {
    this.reactiveState.draggingDirection = direction

    this.emitPluginEvent('directionChanged', { direction })
  }

  /**
   * Get current movement direction
   */
  getDirection(): DirectionMode
  {
    return this.reactiveState.draggingDirection
  }

  /**
   * Resolve coordinates based on current direction mode
   */
  directionResolver(x: number, y: number)
  {
    const direction = this.reactiveState.draggingDirection

    // Determine which coordinates to lock based on direction mode
    const lockX = direction === 'vertical'
    const lockY = direction === 'horizontal'

    return {
      clientX: lockX ? this.startX : x,
      clientY: lockY ? this.startY : y
    }
  }

  /**
   * Get current movement mode
   */
  getMode(): MovementMode
  {
    return this.reactiveState.mode
  }

  /**
   * Set movement mode with reactive update
   */
  setMode(mode: MovementMode): void
  {
    this.reactiveState.mode = mode

    this.eventEmitter.emit('modeChange', {
      type: 'modeChange',
      state: this.getState(),
      mode: this.reactiveState.mode
    })
  }

  /**
   * Update container boundaries
   */
  setBoundaries(boundaries: Partial<Boundaries>): void
  {
    this.config.boundaries = {
      ...this.config.boundaries,
      ...boundaries
    }
  }

  /**
   * Get current container state (reactive)
   */
  getState(): ContainerState
  {
    return {
      x: this.reactiveState.x,
      y: this.reactiveState.y,
      width: this.reactiveState.width,
      height: this.reactiveState.height
    }
  }

  /**
   * Update container position and size with reactive state
   */
  setState(state: Partial<ContainerState>): void
  {
    // Update reactive state - constraints will be applied automatically via computed
    if (state.height !== undefined) this.reactiveState.height = state.height
    if (state.width !== undefined) this.reactiveState.width = state.width
    if (state.x !== undefined) this.reactiveState.x = state.x
    if (state.y !== undefined) this.reactiveState.y = state.y
  }

  /**
   * Bring container to front programmatically
   */
  bringToFront(): void
  {
    const { _uid } = this.config
    this.container.style.zIndex = this.zIndexState.sort(_uid).zIndex(_uid)
  }

  /**
   * Get container DOM element
   */
  getContainer(): HTMLElement
  {
    return this.container
  }

  /**
   * Update auto-adjust configuration
   */
  setAutoAdjust(config: AutoAdjustConfig): void
  {
    this.config.autoAdjust = { ...this.config.autoAdjust, ...config }

    // Restart parent observer if auto-adjust is enabled
    if (this.parentResizeObserver) {
      this.parentResizeObserver.disconnect()
      this.parentResizeObserver = null
    }

    if (this.config.autoAdjust?.enabled) {
      this.setupParentResizeObserver()
    }
  }

  /**
   * Update resize configuration
   */
  setResizeConfig(config: ResizeConfig): void
  {
    this.config.resize = { ...this.config.resize, ...config }

    // Remove existing resize handles
    this.resizeHandles.forEach(handle => handle.remove())
    this.resizeHandles.clear()

    // Initialize new resize handles if enabled
    if (this.config.resize?.enabled) {
      this.initializeResizeHandles()
      this.bindEvents()
    }
  }

  /**
   * Set constrain to parent configuration
   */
  setConstrainToParent(enabled: boolean): void
  {
    this.config.constrainToParent = enabled

    // Update viewport observer based on new constraint configuration
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.shouldConstrainToViewport()) {
      this.setupViewportResizeObserver()
    }
  }

  /**
   * Set constrain to viewport configuration
   */
  setConstrainToViewport(enabled: boolean): void
  {
    this.config.constrainToViewport = enabled

    // Restart viewport observer if enabled
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.shouldConstrainToViewport()) {
      this.setupViewportResizeObserver()
    }
  }

  /**
   * Recalculate container state relative to parent element
   */
  recalculateForParent(): void
  {
    if (!this.config.constrainToParent || !this.container.parentElement) {
      return
    }

    const parentRect = this.container.parentElement.getBoundingClientRect()
    const currentState = this.getState()

    // If the parent has zero dimensions, exit
    if (parentRect.width === 0 || parentRect.height === 0) {
      return
    }

    // Keep the desired dimensions, but limit them to the parent dimensions
    const desiredWidth = currentState.width
    const desiredHeight = currentState.height

    const newWidth = Math.min(desiredWidth, parentRect.width)
    const newHeight = Math.min(desiredHeight, parentRect.height)

    // Save the desired coordinates, but limit them to the parent dimensions
    const desiredX = currentState.x
    const desiredY = currentState.y

    const newX = Math.min(desiredX, parentRect.width - newWidth)
    const newY = Math.min(desiredY, parentRect.height - newHeight)

    // Use reactive state update
    this.setState({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    })

    this.eventEmitter.emit('parentRecalculated', {
      type: 'parentRecalculated',
      state: this.getState(),
      mode: this.reactiveState.mode
    })
  }

  /**
   * Install plugin on this container manager instance
   */
  use(plugin: Plugin, options?: any): ContainerManagerInterface
  {
    // Prevent duplicate plugin installation
    if (this.installedPlugins.has(plugin)) {
      return this
    }

    try {
      plugin.install(this, options)
      this.installedPlugins.add(plugin)
    } catch (error) {
      console.error('[ContainerManager] Failed to install plugin:', error)
    }

    return this
  }

  /**
   * Check if plugin is installed on this instance
   */
  hasPlugin(plugin: Plugin): boolean
  {
    return this.installedPlugins.has(plugin)
  }

  /**
   * Get all installed plugins on this instance
   */
  getInstalledPlugins(): Plugin[]
  {
    return Array.from(this.installedPlugins)
  }

  /**
   * Destroy container manager with proper cleanup
   */
  destroy(): void
  {
    // Clean up reactive effects
    this.reactiveEffects.forEach(effect => effect())
    this.reactiveEffects = []

    // Destroy reactive streams
    this.stateChangeStream.destroy()
    this.dragStream.destroy()
    this.resizeStream.destroy()

    this.eventEmitter.destroy()
    this.pluginEventEmitter.destroy()
    this.domUpdateEffect()

    // Remove event listeners
    this.dragHandle.removeEventListener('mousedown', this.onDragStart)
    this.dragHandle.removeEventListener('touchstart', this.onDragStart)
    this.dragHandle.removeEventListener('contextmenu', this.onContextMenu)

    // Remove resize handle events
    this.resizeHandles.forEach((handle, direction) => {
      handle.removeEventListener('mousedown', (e) => this.onResizeStart(e, direction))
      handle.removeEventListener('touchstart', (e) => this.onResizeStart(e, direction))
    })

    // Clean up ResizeObservers
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.parentResizeObserver) {
      this.parentResizeObserver.disconnect()
      this.parentResizeObserver = null
    }

    // Clear installed plugins
    this.installedPlugins.clear()

    this.zIndexState.remove(this.config._uid)
  }
}
