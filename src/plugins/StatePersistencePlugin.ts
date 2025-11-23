// src/plugins/StatePersistencePlugin.ts

import { batch, effect, reactive } from '@alekstar79/reactive-event-system'
import { debounce } from '../utils'

import {
  ContainerManagerInterface,
  Plugin,
  DirectionMode,
  MovementMode,
  ResizeConfig,
} from '../core/types'

/**
 * Saved state for a container
 */
export interface SavedContainerState {
  x: number
  y: number
  width: number
  height: number
  mode: MovementMode
  draggingDirection: DirectionMode
  isMaximized: boolean
  containerType: string
  title?: string
  color?: string
  useSnapping?: boolean
  isClosed?: boolean
  parentElementId?: string
  closedTimestamp?: number
  resize?: ResizeConfig
  isDemoContainer?: boolean
  [p: string]: any
}

/**
 * Reactive state for persistence plugin
 */
interface PersistencePluginState {
  isSaving: boolean
  lastSaved: number | null
  pendingChanges: boolean
  containerStates: Record<string, SavedContainerState>
  closedQueue: string[]
  demoContainers: string[]
}

/**
 * State persistence plugin for Container Manager
 */
export class StatePersistencePlugin implements Plugin
{
  private static readonly STORAGE_KEY = 'containerManagerState'
  private static readonly CLOSED_QUEUE_KEY = 'containerManagerClosedQueue'
  private static readonly DEMO_CONTAINERS_KEY = 'containerManagerDemoContainers'

  // Статическое реактивное состояние для всех плагинов
  private static reactiveState = reactive<PersistencePluginState>({
    isSaving: false,
    lastSaved: null,
    pendingChanges: false,
    containerStates: {},
    closedQueue: [],
    demoContainers: []
  })

  // Вычисляемое свойство для доступа к состояниям
  private static get containerStates() {
    return StatePersistencePlugin.reactiveState.containerStates
  }

  private static get closedQueue() {
    return StatePersistencePlugin.reactiveState.closedQueue
  }

  private static get demoContainers() {
    return StatePersistencePlugin.reactiveState.demoContainers
  }

  private static isGlobalEventsInitialized = false
  private manager?: ContainerManagerInterface
  private containerId?: string
  private isDemoContainer: boolean = false

  // Эффект для автоматического сохранения при изменении состояния
  private autoSaveEffect?: () => void

  static containers: {
    manager: ContainerManagerInterface,
    containerId: string,
    isDemo?: boolean
  }[] = []

  /**
   * Install plugin on container manager instance with reactive state management
   */
  install(
    manager: ContainerManagerInterface,
    options?: { containerId: string; isDemo?: boolean }
  ): void {
    this.manager = manager
    this.containerId = options?.containerId
    this.isDemoContainer = options?.isDemo || false

    if (!this.containerId) {
      console.warn('[StatePersistencePlugin] containerId is required for state persistence')
      return
    }

    // Register container for global event handling
    StatePersistencePlugin.containers.push({
      manager,
      containerId: this.containerId,
      isDemo: this.isDemoContainer
    })

    // Register demo container if it's a demo
    if (this.isDemoContainer) {
      StatePersistencePlugin.registerDemoContainer(this.containerId)
    }

    // Initialize global events only once
    if (!StatePersistencePlugin.isGlobalEventsInitialized) {
      StatePersistencePlugin.initializeGlobalEvents()
      StatePersistencePlugin.isGlobalEventsInitialized = true
    }

    // Set up auto-save effect for demo containers
    if (this.isDemoContainer) {
      this.setupAutoSaveEffect()
    }

    this.bindContainerEvents()
  }

  /**
   * Set up reactive auto-save effect for container state changes
   */
  private setupAutoSaveEffect(): void
  {
    if (!this.manager || !this.containerId) return

    // Create debounced auto-save effect
    const debouncedSave = debounce(() => {
      if (this.isDemoContainer) {
        this.saveState()
      }
    }, 300)

    // Effect that triggers on container state changes
    this.autoSaveEffect = effect(() => {
      // @ts-ignore - Access manager state to create dependency
      const state = this.manager!.getState()
      // @ts-ignore - Access manager mode to create dependency
      const mode = this.manager!.getMode()

      // This effect will re-run whenever state or mode changes
      // We use debouncing to avoid too frequent saves
      debouncedSave()
    })
  }

  /**
   * Bind to container-specific events to save state on changes
   * Simplified since most saving handled using effects
   */
  private bindContainerEvents(): void
  {
    if (!this.manager) return

    // Only bind critical events that aren't covered by reactive effects
    this.manager.on('dragStart', (/* event: any */) => {
      // Drag start might need immediate save for some cases
    })

    this.manager.on('dragEnd', (/* event: any */) => {
      // Force save on drag end for immediate persistence
      if (this.isDemoContainer) this.saveState()
    })

    this.manager.on('resizeEnd', (/* event: any */) => {
      // Force save on resize end for immediate persistence
      if (this.isDemoContainer) this.saveState()
    })

    // Listen for maximize/restore events
    this.manager.onPluginEvent('maximizeChanged', (/* data: { isMaximized: boolean } */) => {
      if (this.isDemoContainer) this.saveState()
    })

    // Listen for direction changes
    this.manager.onPluginEvent('directionChanged', (/* data: { direction: string } */) => {
      if (this.isDemoContainer) this.saveState()
    })
  }

  /**
   * Initialize global event handlers for all containers
   */
  private static initializeGlobalEvents(): void
  {
    // Save state when page is about to unload
    window.addEventListener('beforeunload', () => {
      StatePersistencePlugin.saveAllContainers()
    })

    // Save state when page becomes hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        StatePersistencePlugin.saveAllContainers()
      }
    })

    // Save state when window is resized
    window.addEventListener('resize', debounce(() => {
      StatePersistencePlugin.saveAllContainers()
    }, 500))
  }

  /**
   * Register a container as a demo container
   */
  private static registerDemoContainer(containerId: string): void
  {
    try {
      // Update reactive state
      if (!StatePersistencePlugin.demoContainers.includes(containerId)) {
        StatePersistencePlugin.demoContainers.push(containerId)
        StatePersistencePlugin.saveDemoContainersToStorage()
      }
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to register demo container:', error)
    }
  }

  /**
   * Save demo containers to localStorage
   */
  private static saveDemoContainersToStorage(): void
  {
    try {
      localStorage.setItem(
        StatePersistencePlugin.DEMO_CONTAINERS_KEY,
        JSON.stringify(StatePersistencePlugin.demoContainers)
      )
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to save demo containers:', error)
    }
  }

  /**
   * Get list of all demo containers
   */
  private static getDemoContainers(): string[]
  {
    try {
      const stored = localStorage.getItem(StatePersistencePlugin.DEMO_CONTAINERS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to parse demo containers:', error)
      return []
    }
  }

  /**
   * Check if a container is a demo container
   */
  static isDemoContainer(containerId: string): boolean
  {
    const demoContainers = StatePersistencePlugin.getDemoContainers()
    return demoContainers.includes(containerId)
  }

  /**
   * Get all saved states from localStorage
   */
  private static getAllStates(): Record<string, SavedContainerState>
  {
    try {
      const stored = localStorage.getItem(StatePersistencePlugin.STORAGE_KEY)
      return stored ? JSON.parse(stored) : {}
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to parse stored states:', error)
      return {}
    }
  }

  /**
   * Add container ID to closed containers queue
   */
  static addToClosedQueue(containerId: string): void
  {
    // Only add demo containers to the closed queue
    if (!StatePersistencePlugin.isDemoContainer(containerId)) {
      console.log(`[StatePersistencePlugin] Skipping closed queue for non-demo container: ${containerId}`)
      return
    }

    // Verify that the container state exists before adding to queue
    const containerState = StatePersistencePlugin.getContainerState(containerId)
    if (!containerState) {
      console.error(`[StatePersistencePlugin] Cannot add ${containerId} to closed queue: state not found`)
      return
    }

    // Update reactive state
    const closedQueue = StatePersistencePlugin.closedQueue

    // Remove if already exists (to avoid duplicates)
    const existingIndex = closedQueue.indexOf(containerId)
    if (existingIndex > -1) {
      closedQueue.splice(existingIndex, 1)
    }

    // Add to the end (most recent closed)
    closedQueue.push(containerId)
    StatePersistencePlugin.saveClosedQueueToStorage()
  }

  /**
   * Save closed queue to localStorage
   */
  private static saveClosedQueueToStorage(): void
  {
    try {
      localStorage.setItem(
        StatePersistencePlugin.CLOSED_QUEUE_KEY,
        JSON.stringify(StatePersistencePlugin.closedQueue)
      )
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to save closed queue:', error)
    }
  }

  /**
   * Get closed containers queue (LIFO - last in first out)
   */
  static getClosedQueue(): string[]
  {
    try {
      const stored = localStorage.getItem(StatePersistencePlugin.CLOSED_QUEUE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to parse closed queue:', error)
      return []
    }
  }

  private saveState(): void
  {
    if (!this.manager || !this.containerId || !this.isDemoContainer) return

    // Use batch updates for multiple state changes
    batch(() => {
      StatePersistencePlugin.reactiveState.isSaving = true
      StatePersistencePlugin.reactiveState.pendingChanges = true

      const container = this.manager!.getContainer()
      const isMaximized = container.dataset.maximized === 'true'

      // Get current state
      const state = this.manager!.getState()
      const mode = this.manager!.getMode()
      const draggingDirection = this.manager!.getDirection()
      const containerType = container.dataset.containerType || 'unknown'
      const title = container.dataset.title
      const color = container.dataset.color
      const useSnapping = container.dataset.useSnapping === 'true'
      const resizeConfig = (this.manager as any).config?.resize

      // Get parent element ID if exists
      const parentElement = container.parentElement
      const parentElementId = parentElement && parentElement !== document.body
        ? (parentElement.id || `parent-${this.containerId}`)
        : undefined

      const savedState: SavedContainerState = {
        ...state,
        mode,
        draggingDirection,
        isMaximized,
        containerType,
        title,
        color,
        useSnapping,
        isClosed: false,
        parentElementId,
        closedTimestamp: 0,
        resize: resizeConfig,
        isDemoContainer: true
      }

      // Update reactive state
      StatePersistencePlugin.reactiveState.containerStates[this.containerId!] = savedState

      // Get ALL current states and update only the needed one
      const allStates = StatePersistencePlugin.getAllStates()
      allStates[this.containerId!] = savedState

      // Save to localStorage
      localStorage.setItem(
        StatePersistencePlugin.STORAGE_KEY,
        JSON.stringify(allStates)
      )

      StatePersistencePlugin.reactiveState.lastSaved = Date.now()
      StatePersistencePlugin.reactiveState.isSaving = false
    })
  }

  /**
   * Save container state with current manager state before closing
   */
  static saveContainerStateBeforeClose(manager: ContainerManagerInterface, containerId: string): void
  {
    const state = manager.getState()
    const mode = manager.getMode()

    // Check if this is a demo container
    const isDemoContainer = StatePersistencePlugin.isDemoContainer(containerId)

    // Only save state for demo containers
    if (!isDemoContainer) {
      StatePersistencePlugin.containers = StatePersistencePlugin.containers.filter(
        c => c.containerId !== containerId
      )
      return
    }

    // Get additional container data from the container element
    const container = manager.getContainer()
    const draggingDirection = manager.getDirection()
    const isMaximized = container.dataset.maximized === 'true'
    const containerType = container.dataset.containerType || 'unknown'
    const title = container.dataset.title
    const color = container.dataset.color
    const useSnapping = container.dataset.useSnapping === 'true'
    const resizeConfig = (manager as any).config?.resize

    // Get edge docking state
    const isEdgeDocked = (manager as any).isEdgeDocked?.() || false
    const dockEdge = (manager as any).getDockEdge?.() || null

    // Get parent element ID if exists
    const parentElement = container.parentElement
    const parentElementId = parentElement && parentElement !== document.body
      ? (parentElement.id || `parent-${containerId}`)
      : undefined

    // Create the closed container state
    const closedState: SavedContainerState = {
      ...state,
      mode,
      draggingDirection,
      isMaximized,
      isEdgeDocked,
      dockEdge: dockEdge || undefined,
      containerType,
      title,
      color,
      useSnapping,
      isClosed: true,
      parentElementId,
      closedTimestamp: Date.now(),
      resize: resizeConfig,
      isDemoContainer: true
    }

    // Update the state
    // StatePersistencePlugin.updateContainerState(containerId, closedState)

    // Get ALL current states from localStorage
    const allStates = StatePersistencePlugin.getAllStates()

    // Update the state for this container
    allStates[containerId] = closedState

    try {
      // Save ALL states back to localStorage
      localStorage.setItem(
        StatePersistencePlugin.STORAGE_KEY,
        JSON.stringify(allStates)
      )

      // Verify the save
      // StatePersistencePlugin.getAllStates()
    } catch (error) {
      console.error(`[StatePersistencePlugin] Failed to save to localStorage:`, error)
    }

    // Update reactive state for consistency
    StatePersistencePlugin.reactiveState.containerStates[containerId] = closedState
    // Remove container from tracked containers
    StatePersistencePlugin.containers = StatePersistencePlugin.containers.filter(
      c => c.containerId !== containerId
    )
    // Add to closed containers queue - only for demo containers
    StatePersistencePlugin.addToClosedQueue(containerId)
  }

  /**
   * Save all containers state (for global events) - including closed ones
   */
  static saveAllContainers(): void
  {
    // Use batch update for multiple container states
    batch(() => {
      // Get current states from localStorage to preserve closed containers
      const allStates = StatePersistencePlugin.getAllStates()

      // Update only the open demo containers
      StatePersistencePlugin.containers
        .filter(({ isDemo }) => isDemo)
        .forEach(({ manager, containerId }) => {
          const state = manager.getState()
          const mode = manager.getMode()

          const container = manager.getContainer()
          const draggingDirection = manager.getDirection()
          const isMaximized = container.dataset.maximized === 'true'
          const containerType = container.dataset.containerType || 'unknown'
          const title = container.dataset.title
          const color = container.dataset.color
          const useSnapping = container.dataset.useSnapping === 'true'
          const resizeConfig = (manager as any).config?.resize

          const parentElement = container.parentElement
          const parentElementId = parentElement && parentElement !== document.body
            ? (parentElement.id || `parent-${containerId}`)
            : undefined

          allStates[containerId] = {
            ...state,
            mode,
            draggingDirection,
            isMaximized,
            containerType,
            title,
            color,
            useSnapping,
            isClosed: false,
            parentElementId,
            closedTimestamp: 0,
            resize: resizeConfig,
            isDemoContainer: true
          }
        })

      StatePersistencePlugin.reactiveState.containerStates = allStates

      localStorage.setItem(
        StatePersistencePlugin.STORAGE_KEY,
        JSON.stringify(allStates)
      )

      StatePersistencePlugin.reactiveState.lastSaved = Date.now()
    })
  }

  /**
   * Remove the most recently closed container from queue and return its ID
   */
  static popLastClosedContainer(): string | null
  {
    try {
      // Update reactive state
      const closedQueue = StatePersistencePlugin.closedQueue

      if (closedQueue.length === 0) return null

      const lastContainerId = closedQueue.pop()!
      StatePersistencePlugin.saveClosedQueueToStorage()

      return lastContainerId
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to pop last closed container:', error)
      return null
    }
  }

  /**
   * Check if there are any closed containers that can be restored
   */
  static hasClosedContainers(): boolean
  {
    return StatePersistencePlugin.closedQueue.length > 0
  }

  /**
   * Get saved state for specific container (including closed ones)
   */
  static getContainerState(containerId: string): SavedContainerState | null
  {
    try {
      // First check reactive state
      const stateFromReactive = StatePersistencePlugin.containerStates[containerId]
      if (stateFromReactive) return stateFromReactive

      // If not found in reactive state, check localStorage directly
      const states = StatePersistencePlugin.getAllStates()
      const stateFromStorage = states[containerId]

      if (stateFromStorage) {
        // Update reactive state for consistency
        StatePersistencePlugin.reactiveState.containerStates[containerId] = stateFromStorage
        return stateFromStorage
      }

      return null
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to get container state:', error)
      return null
    }
  }

  /**
   * Get all container states including closed ones
   */
  static getAllContainerStates(): Record<string, SavedContainerState>
  {
    return StatePersistencePlugin.getAllStates()
  }

  /**
   * Check if container state exists (including closed)
   */
  static hasContainerState(containerId: string): boolean
  {
    return StatePersistencePlugin.getContainerState(containerId) !== null
  }

  /**
   * Update container state in storage
   */
  static updateContainerState(containerId: string, updates: Partial<SavedContainerState>): void
  {
    try {
      // Получаем текущие состояния из localStorage
      const currentStates = StatePersistencePlugin.getAllStates()

      // Обновляем состояние для конкретного контейнера
      const currentState = currentStates[containerId]
      if (currentState) {
        const updatedState = { ...currentState, ...updates }
        currentStates[containerId] = updatedState

        // Сохраняем все состояния в localStorage
        localStorage.setItem(
          StatePersistencePlugin.STORAGE_KEY,
          JSON.stringify(currentStates)
        )

        // Также обновляем reactive state для согласованности
        StatePersistencePlugin.reactiveState.containerStates[containerId] = updatedState
      } else {
        console.warn(`[StatePersistencePlugin] No state found for container ${containerId}, creating new state`)

        // Create new state if it doesn't exist
        const newState: SavedContainerState = {
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          mode: 'smooth',
          draggingDirection: 'all',
          isMaximized: false,
          containerType: 'unknown',
          isClosed: false,
          isDemoContainer: StatePersistencePlugin.isDemoContainer(containerId),
          ...updates
        }

        currentStates[containerId] = newState

        localStorage.setItem(
          StatePersistencePlugin.STORAGE_KEY,
          JSON.stringify(currentStates)
        )

        StatePersistencePlugin.reactiveState.containerStates[containerId] = newState
      }
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to update container state:', error)
    }
  }

  /**
   * Clear all saved states from localStorage
   */
  static clearStorage(): void
  {
    // Reset all reactive state
    batch(() => {
      StatePersistencePlugin.reactiveState.containerStates = {}
      StatePersistencePlugin.closedQueue.length = 0
      StatePersistencePlugin.demoContainers.length = 0
      StatePersistencePlugin.reactiveState.isSaving = false
      StatePersistencePlugin.reactiveState.lastSaved = null
      StatePersistencePlugin.reactiveState.pendingChanges = false
    })

    localStorage.removeItem(StatePersistencePlugin.STORAGE_KEY)
    localStorage.removeItem(StatePersistencePlugin.CLOSED_QUEUE_KEY)
    localStorage.removeItem(StatePersistencePlugin.DEMO_CONTAINERS_KEY)
    StatePersistencePlugin.containers = []
  }

  /**
   * Initialize reactive state from localStorage on plugin load
   */
  static initializeReactiveState(): void
  {
    try {
      // Load initial state from localStorage
      const storedStates = StatePersistencePlugin.getAllStates()
      const closedQueue = StatePersistencePlugin.getClosedQueue()
      const demoContainers = StatePersistencePlugin.getDemoContainers()

      // Update reactive state
      batch(() => {
        StatePersistencePlugin.reactiveState.containerStates = storedStates

        // Update closedQueue and demoContainers
        StatePersistencePlugin.closedQueue.length = 0
        StatePersistencePlugin.closedQueue.push(...closedQueue)

        StatePersistencePlugin.demoContainers.length = 0
        StatePersistencePlugin.demoContainers.push(...demoContainers)
      })
    } catch (error) {
      console.error('[StatePersistencePlugin] Failed to initialize reactive state:', error)
    }
  }

  /**
   * Get plugin metrics and statistics
   */
  static getMetrics(): {
    totalContainers: number
    demoContainers: number
    closedContainers: number
    lastSaved: number | null
    isSaving: boolean
  } {
    return {
      totalContainers: Object.keys(StatePersistencePlugin.containerStates).length,
      demoContainers: StatePersistencePlugin.demoContainers.length,
      closedContainers: StatePersistencePlugin.closedQueue.length,
      lastSaved: StatePersistencePlugin.reactiveState.lastSaved,
      isSaving: StatePersistencePlugin.reactiveState.isSaving
    }
  }

  /**
   * Debug method to check the current state of localStorage
   */
  static debugStorage(): void
  {
    console.log(`[StatePersistencePlugin] === START DEBUG INFO ===`)

    try {
      const stored = localStorage.getItem(StatePersistencePlugin.STORAGE_KEY)
      if (stored) {
        const states = JSON.parse(stored)
        console.log(`[StatePersistencePlugin] Number of states: ${Object.keys(states).length}`)
        console.log(`[StatePersistencePlugin] State keys:`, Object.keys(states))

        for (const [key, state] of Object.entries(states)) {
          console.log(`[StatePersistencePlugin] State ${key}:`, {
            isDemoContainer: (state as any).isDemoContainer,
            isClosed: (state as any).isClosed,
            title: (state as any).title
          })
        }
      }

      const closedQueue = localStorage.getItem(StatePersistencePlugin.CLOSED_QUEUE_KEY)
      console.log(`[StatePersistencePlugin] Closed queue:`, closedQueue ? JSON.parse(closedQueue) : [])

      const demoContainers = localStorage.getItem(StatePersistencePlugin.DEMO_CONTAINERS_KEY)
      console.log(`[StatePersistencePlugin] Demo containers:`, demoContainers ? JSON.parse(demoContainers) : [])

    } catch (error) {
      console.error(`[StatePersistencePlugin] Debug error:`, error)
    }

    console.log(`[StatePersistencePlugin] === END DEBUG INFO ===`)
  }

  /**
   * Clean up plugin resources
   */
  destroy(): void
  {
    // Clean up reactive effect
    if (this.autoSaveEffect) {
      this.autoSaveEffect()
      this.autoSaveEffect = undefined
    }

    // Remove this container from tracked containers
    if (this.containerId) {
      StatePersistencePlugin.containers = StatePersistencePlugin.containers.filter(
        c => c.containerId !== this.containerId
      )
    }
  }
}

// Initialize reactive state when module loads
StatePersistencePlugin.initializeReactiveState()
