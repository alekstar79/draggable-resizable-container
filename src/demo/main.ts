// src/demo/main.ts

import { DemoContainerFactory } from './DemoContainerFactory'
import {
  MovementMode,
  ContainerManager,
  ContainerInitializer
} from '../index'
import {
  EdgeDockingPlugin,
  LoggingPlugin,
  SnappingPlugin,
  StatePersistencePlugin
} from '../plugins'

import {
  type StateInterface,
  ContentCreator,
  NotificationSystem,
  TemplateLoader,
  StatsManager,
  clickOutside,
  extendedMap,
  getTemplateLoader,
  initializeTemplateSystem,
  getState
} from '../utils'

import type {
  AutoAdjustConfig,
  Boundaries,
  ContainerState,
  ContainerManagerInterface,
  DirectionMode,
  ResizeConfig,
} from '../core/types'

import '../styles/base.css'
import './css/styles.css'

interface ContainerCreationParams {
  x?: number;
  y?: number;
  width: number;
  height: number;
  content: string | HTMLElement | { template: string };
  type: 'string' | 'template' | 'element';
  title?: string;
  color?: string;
  draggingDirection?: DirectionMode;
  useSnapping?: boolean;
  boundaries?: Boundaries;
  constrainToParent?: boolean;
  autoAdjust?: AutoAdjustConfig;
  resize?: ResizeConfig;
  constrainToViewport?: boolean;
  containerId?: string;
  parentElement?: HTMLElement;
  restoreState?: boolean;
  isDemoContainer?: boolean;
  mode?: MovementMode
}

interface DemoContainer {
  manager: ContainerManagerInterface
  element: HTMLElement
  type: string
  _uid: string
  hasSnapping: boolean
  containerId: string
  isDemoContainer: boolean
  maximizeState?: {
    isMaximized: boolean
    originalState: ContainerState
  }
}

/**
 * Advanced demo showcasing new features:
 * - Template loading
 * - Individual container mode controls
 * - Multiple content types
 * - Snapping plugin integration
 * - Logging and notifications system
 * - Container-specific statistics on hover
 */
class ContainerManagerDemo
{
  private readonly notificationSystem: NotificationSystem
  private readonly templateLoader: TemplateLoader
  private contentCreator: ContentCreator
  private demoFactory: DemoContainerFactory
  private statsManager: StatsManager

  private state: StateInterface = getState()
  private containers: DemoContainer[] = []

  private isGlobalPinned: boolean = false
  private pinButton: HTMLButtonElement | null = null
  private dIcons = ContainerManagerDemo.directionToIconMap()
  private parentContainers: Map<string, HTMLElement> = new Map()
  private hideTimeout: number | null = null
  private currentHoveredContainerId: string | null = null
  private isAnyContainerDragging: boolean = false

  private maximizeStates: Map<string, {
    originalState: ContainerState
    resizeHandler?: () => void
  }> = new Map()

  static async init(): Promise<ContainerManagerDemo>
  {
    await initializeTemplateSystem()

    return new Promise((resolve, reject) => {
      try {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            resolve(new ContainerManagerDemo())
          })
        } else {
          resolve(new ContainerManagerDemo())
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  static directionToIconMap()
  {
    return extendedMap<DirectionMode, string>({
      all: 'fa-up-down-left-right',
      horizontal: 'fa-left-right',
      vertical: 'fa-up-down'
    })
  }

  constructor()
  {
    this.templateLoader = getTemplateLoader()
    this.contentCreator = new ContentCreator(this.templateLoader)
    this.notificationSystem = new NotificationSystem()
    this.demoFactory = new DemoContainerFactory()
    this.statsManager = new StatsManager()

    this.createUI()
    this.createDemoContainers().catch(console.error)
    this.bindGlobalEvents()
    this.initializeEventBasedSaving()
    this.updateStats()
    this.updateClosedContainersInfo()
  }

  // ---------- МЕТОДЫ СОХРАНЕНИЯ СОСТОЯНИЯ ----------

  /**
   * Save state of all open containers
   */
  private saveAllContainersState(): void
  {
    StatePersistencePlugin.saveAllContainers()
  }

  /**
   * Initialize event-based saving
   */
  private initializeEventBasedSaving(): void
  {
    // Save state when page is about to unload
    window.addEventListener('beforeunload', () => {
      this.saveAllContainersState()
    })

    // Save state when page becomes hidden (tab switch, minimize, etc.)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveAllContainersState()
      }
    })

    // Save state when window is resized (containers might adjust)
    window.addEventListener('resize', () => {
      // Use debounce to avoid too many saves during resize
      clearTimeout((window as any).resizeSaveTimeout)
      ;(window as any).resizeSaveTimeout = setTimeout(() => {
        this.saveAllContainersState()
      }, 500)
    })
  }

  // ---------- USER INTERFACE METHODS ----------

  /**
   * Create enhanced user interface
   */
  private createUI(): void
  {
    const app = document.getElementById('app')!

    // Main controls panel
    const controls = document.createElement('div')
    controls.className = 'demo-controls'
    controls.innerHTML = `
    <div class="demo-controls-header">
      <button class="demo-controls-toggle" id="demoControlsToggle">
        <i class="fa-solid fa-bars"></i>
      </button>
      <h3 class="demo-controls-title">Container Manager</h3>
    </div>

    <div class="demo-controls-scrollable">
      <div class="demo-controls-content">
        <div class="controls-group">
          <h4>Global Movement Mode</h4>
          <div class="btn-group">
            <button class="btn btn-danger" id="globalPinBtn">
              Enable Pinned Mode
            </button>
          </div>
        </div>

        <div class="controls-group">
          <h4>Snap Settings (for snapping containers)</h4>
          
          <div class="input-group">
            <label for="snapStep">Step Size:</label>
            <input type="number" id="snapStep" value="30" min="1" max="100">
          </div>
          
          <div class="input-group">
            <label for="snapMode">Mode:</label>
            <select id="snapMode">
              <option value="all">All Directions</option>
              <option value="horizontal">Horizontal Only</option>
              <option value="vertical">Vertical Only</option>
            </select>
          </div>
          
          <div class="snapping-status" id="snappingStatus" style="margin-top: 8px; font-size: 0.8rem; color: #6b7280;">
            Current: All Directions, Step: 15px
          </div>
        </div>

        <div class="controls-group">
          <h4>Container Actions</h4>
          
          <div class="btn-group">
            <button class="btn btn-primary" id="addStringContainer">
              String Content
            </button>
            <button class="btn btn-success" id="addTemplateContainer">
              Template Content
            </button>
            <button class="btn btn-warning" id="addElementContainer">
              DOM Element
            </button>
            <button class="btn btn-info" id="addSnappingContainer">
              With Snapping
            </button>
            <button class="btn btn-danger" id="clearAll">
              Clear All
            </button>
          </div>
        </div>

        <div class="controls-group">
          <h4>State Persistence</h4>
          <div class="btn-group">
            <button class="btn btn-success" id="restoreContainer">
              Restore Container
            </button>
            <button class="btn btn-warning" id="clearStorage">
              Clear Storage
            </button>
          </div>
        </div>
      </div>
    </div>`

    const statsPanel = document.createElement('div')
    statsPanel.className = 'stats-panel'
    statsPanel.id = 'statsPanel'

    // Initializing global statistics
    const globalStats = this.getGlobalStats()
    statsPanel.innerHTML = this.generateGlobalStatsHTML(globalStats)

    app.appendChild(controls)
    app.appendChild(statsPanel)

    // Initialize burger menu functionality
    this.initializeBurgerMenu()

    // Initializing the Statistics Manager
    this.statsManager.initialize(statsPanel)

    this.bindStepInputEvents(app.querySelector('#snapStep'))

    // Save link to the pinned button for management
    this.pinButton = document.getElementById('globalPinBtn') as HTMLButtonElement
  }

  /**
   * Initialize burger menu functionality for demo controls
   */
  private initializeBurgerMenu(): void
  {
    const toggleButton = document.getElementById('demoControlsToggle') as HTMLButtonElement
    const controls = document.querySelector('.demo-controls') as HTMLElement

    if (!toggleButton || !controls) return

    let isOpen = false

    const toggleMenu = (): void => {
      isOpen = !isOpen

      if (isOpen) {
        // Open animation
        controls.classList.add('demo-controls-open')
        const icon = toggleButton.querySelector('i')
        if (icon) {
          icon.classList.remove('fa-bars')
          icon.classList.add('fa-xmark')
        }
      } else {
        // Close animation
        controls.classList.remove('demo-controls-open')
        const icon = toggleButton.querySelector('i')
        if (icon) {
          icon.classList.remove('fa-xmark')
          icon.classList.add('fa-bars')
        }
      }
    }

    // Add click event to toggle button
    toggleButton.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleMenu()
    })
  }

  // ---------- CONTAINER STATISTICS METHODS ----------

  /**
   * Set up hover events for container to show individual statistics
   */
  private setupContainerHoverEvents(container: HTMLElement, containerId: string): void
  {
    let isMouseOverContainer = false

    // Mouse enter on the container
    container.addEventListener('mouseenter', () => {
      isMouseOverContainer = true
      this.cancelHideTimeout()
      this.showContainerStats(containerId)
    })

    // Mouse leave from the container
    container.addEventListener('mouseleave', (e) => {
      isMouseOverContainer = false

      // Do not hide statistics if the mouse moves to controls within the same container
      const relatedTarget = e.relatedTarget as HTMLElement
      if (relatedTarget && container.contains(relatedTarget)) {
        return
      }

      // Do not hide during dragging
      if (this.isAnyContainerDragging) {
        return
      }

      this.scheduleHideStats()
    })

    // Tracking clicks inside the container
    container.addEventListener('click', () => {
      if (isMouseOverContainer) {
        this.cancelHideTimeout()
        this.showContainerStats(containerId)
      }
    })

    // Tracking the mouse movement inside the container
    container.addEventListener('mousemove', () => {
      if (isMouseOverContainer) {
        this.cancelHideTimeout()
      }
    })
  }

  /**
   * Cancel pending hide timeout
   */
  private cancelHideTimeout(): void
  {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }

  /**
   * Schedule hiding of container stats
   */
  private scheduleHideStats(): void
  {
    this.cancelHideTimeout()
    this.hideTimeout = window.setTimeout(() => {
      this.showGlobalStats()
    }, 100)
  }

  /**
   * Show statistics for specific container
   */
  private showContainerStats(containerId: string): void
  {
    if (this.currentHoveredContainerId === containerId) {
      return
    }

    const containerData = this.containers.find(c => c.containerId === containerId)
    if (!containerData) return

    const containerStats = this.getContainerStats(containerData.manager, containerId)
    this.statsManager.showContainerStats(containerStats)
    this.currentHoveredContainerId = containerId
  }

  /**
   * Show global statistics
   */
  private showGlobalStats(): void
  {
    this.updateStats()
    this.currentHoveredContainerId = null
  }

  /**
   * Get container-specific statistics
   */
  private getContainerStats(manager: ContainerManagerInterface, containerId: string): any
  {
    const mode = manager.getMode()
    const direction = manager.getDirection()
    const snappingConfig = manager.getSnappingConfig?.()

    const title = manager.getContainer().dataset.title || containerId

    return {
      activeBlock: this.formatContainerTitle(title),
      lock: mode === 'pinned' ? 'locked' : 'opened',
      direction: direction,
      step: snappingConfig?.snapStep,
      hasSnapping: snappingConfig?.enabled || false
    }
  }

  /**
   * Format container title for display in stats
   */
  private formatContainerTitle(title: string): string
  {
    return title.toLowerCase().replace(/\s+/g, '-')
  }

  /**
   * Get global statistics
   */
  private getGlobalStats(): any
  {
    const typeCount: Record<string, number> = { string: 0, template: 0, element: 0 }
    this.containers.forEach(({ type }) => {
      typeCount[type]++
    })

    const isGlobalPinned = this.containers.some(({ manager }) => manager.getMode() === 'pinned')

    return {
      containerCount: this.containers.length,
      contentTypes: `S:${typeCount.string} T:${typeCount.template} E:${typeCount.element}`,
      pinnedMode: isGlobalPinned ? 'Enabled' : 'Disabled',
      snappingCount: this.containers.filter(c => c.hasSnapping).length
    }
  }

  /**
   * Generate HTML for global statistics
   */
  private generateGlobalStatsHTML(stats: any): string
  {
    return `
      <h4>Global Stats</h4>
      <div class="stat-item">
        <span class="stat-label">Containers:</span>
        <span class="stat-value">${stats.containerCount}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Content Types:</span>
        <span class="stat-value">${stats.contentTypes}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Pinned Mode:</span>
        <span class="stat-value">${stats.pinnedMode}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">With Snapping:</span>
        <span class="stat-value">${stats.snappingCount}</span>
      </div>`
  }

  // ---------- CONTAINER MANAGEMENT METHODS ----------

  /**
   * Update closed containers info display
   */
  private updateClosedContainersInfo(): void
  {
    try {
      const restoreButton = document.getElementById('restoreContainer') as HTMLButtonElement
      const closedCount = StatePersistencePlugin.getClosedQueue().length

      // Update restore button state
      if (restoreButton) {
        restoreButton.disabled = closedCount === 0

        if (closedCount === 0) {
          restoreButton.classList.add('btn-disabled')
          restoreButton.title = 'No closed containers to restore'
        } else {
          restoreButton.classList.remove('btn-disabled')
          restoreButton.title = `Restore last closed container (${closedCount} available)`
        }
      }
    } catch (error) {
    }
  }

  private async restoreLastClosedContainer(): Promise<void>
  {
    // Debug storage state before restoration
    StatePersistencePlugin.debugStorage()

    if (!StatePersistencePlugin.hasClosedContainers()) {
      this.notificationSystem.show('No closed demo containers to restore', 'warning')
      return
    }

    const containerId = StatePersistencePlugin.popLastClosedContainer()
    if (!containerId) {
      this.notificationSystem.show('Failed to restore container', 'error')
      return
    }

    // Check if container is already open
    const isAlreadyOpen = this.containers.some(c => c.containerId === containerId)
    if (isAlreadyOpen) {
      this.notificationSystem.show('Container is already open', 'warning')
      // Add container back to closed queue since we popped it
      StatePersistencePlugin.addToClosedQueue(containerId)
      return
    }

    this.state.push(containerId)

    // Check if container state exists with detailed debugging
    const savedState = StatePersistencePlugin.getContainerState(containerId)
    if (!savedState) {
      // Debug why state might be missing
      StatePersistencePlugin.debugStorage()
      this.notificationSystem.show('Container state not found', 'error')
      return
    }

    try {
      await this.createContainerFromSavedState(containerId, savedState)
      this.notificationSystem.show(`Demo container "${savedState.title || containerId}" restored`, 'success')
      this.updateClosedContainersInfo()
    } catch (error) {
      this.notificationSystem.show('Failed to restore container', 'error')
      // If restoration failed, add container back to closed queue
      StatePersistencePlugin.addToClosedQueue(containerId)
    }
  }

  /**
   * Create container from saved state
   */
  private async createContainerFromSavedState(containerId: string, savedState: any): Promise<void>
  {
    // Validate saved state
    if (!savedState || typeof savedState !== 'object') {
      throw new Error('Invalid saved state')
    }

    const content = await this.getContentForSavedState(containerId, savedState)

    // Find or create parent element
    let parentElement: HTMLElement | undefined
    if (savedState.parentElementId) {
      parentElement = document.getElementById(savedState.parentElementId) || undefined

      // If parent element doesn't exist but this is a parent-constrained container, create it
      if (!parentElement && containerId === 'demo-parent-constrained-container') {
        parentElement = this.createParentElement(savedState.parentElementId)
      }
    }

    // Use the exact saved coordinates.
    const config = this.demoFactory.getDemoConfig(containerId)

    // Use saved properties with precise positioning
    await this.createContainer({
      x: savedState.x,
      y: savedState.y,
      width: savedState.width,
      height: savedState.height,
      content,
      type: savedState.containerType as 'string' | 'template' | 'element',
      title: savedState.title,
      color: savedState.color,
      draggingDirection: savedState.draggingDirection,
      useSnapping: savedState.useSnapping,
      containerId,
      parentElement,
      boundaries: config?.boundaries || savedState.boundaries || {},
      constrainToParent: !!savedState.parentElementId,
      restoreState: true,
      resize: savedState.resize,
      isDemoContainer: this.demoFactory.isDemoContainer(containerId),
      mode: savedState.mode
    })

    // Update container state to mark as open
    StatePersistencePlugin.updateContainerState(containerId, {
      closedTimestamp: 0,
      isClosed: false
    })
  }

  private syncContainerControlButtons(
    container: HTMLElement,
    mode: MovementMode,
    direction: DirectionMode
  ): void {
    // Sync pin button
    const pinButton = container.querySelector('.pin-btn') as HTMLButtonElement
    if (pinButton) {
      const icon = pinButton.querySelector('i')
      if (icon) {
        if (mode === 'pinned') {
          icon.classList.remove('fa-lock-open')
          icon.classList.add('fa-lock')
        } else {
          icon.classList.remove('fa-lock')
          icon.classList.add('fa-lock-open')
        }
      }
    }

    // Sync direction button
    this.updateContainerDirectionButton(container, direction)

    // Update container data attribute
    container.setAttribute('data-mode', mode)
  }

  /**
   * Get appropriate content for saved state
   */
  private async getContentForSavedState(containerId: string, savedState: any): Promise<string | HTMLElement | { template: string }>
  {
    // Use demo factory for demo containers to ensure consistent content
    if (this.demoFactory.isDemoContainer(containerId)) {
      const config = this.demoFactory.getDemoConfig(containerId)
      if (config) {
        return await this.demoFactory.createDemoContent(containerId, config)
      }
    }

    // Fallback for non-demo containers
    if (savedState.containerType === 'template') {
      return { template: 'media' }
    } else if (savedState.containerType === 'element') {
      const element = document.createElement('div')
      element.innerHTML = `
        <div class="content-section">
          <h4>${savedState.title || 'Restored Container'}</h4>
          <p>This container was restored from localStorage.</p>
          <div class="feature-list">
            <div class="feature-item">✅ Restored from storage</div>
            <div class="feature-item">✅ Previous state preserved</div>
          </div>
        </div>`
      return element
    } else {
      return `
        <div class="content-section">
          <h4>${savedState.title || 'Restored Container'}</h4>
          <p>This container was restored from localStorage.</p>
          <div class="feature-list">
            <div class="feature-item">✅ Restored from storage</div>
            <div class="feature-item">✅ Previous state preserved</div>
            <div class="feature-item">✅ Position and size maintained</div>
          </div>
        </div>`
    }
  }

  /**
   * Create parent element for constrained containers
   */
  private createParentElement(elementId: string): HTMLElement
  {
    const parentElement = document.createElement('div')
    parentElement.id = elementId
    parentElement.className = 'container-parent'
    parentElement.style.cssText = `
      position: relative;
      top: 100px;
      left: 100px;
      min-height: 200px;
      max-width: 60%;
      background: rgba(255, 255, 255, 0.1);
      border: 2px dashed rgb(66, 153, 225);
      border-radius: 8px;`

    document.body.appendChild(parentElement)

    this.parentContainers.set(elementId, parentElement)

    return parentElement
  }

  /**
   * Create initial demo containers
   */
  private async createDemoContainers(): Promise<void>
  {
    // Check if we have open demo containers in storage to restore
    const savedStates = StatePersistencePlugin.getAllContainerStates()

    // Filter for open demo containers AND closed demo containers that should be restored
    const openContainers = Object.entries(savedStates)
      .filter(([containerId, state]) => {
        const isDemo = this.demoFactory.isDemoContainer(containerId)
        const isOpen = !state.isClosed

        return isDemo && isOpen && state
      })

    if (openContainers.length > 0) {
      // Restore open demo containers from storage
      for (const [containerId, savedState] of openContainers) {
        if (!this.containers.find(c => c.containerId === containerId)) {
          try {
            await this.createContainerFromSavedState(containerId, savedState)
          } catch (error) {
            console.error(`Failed to restore container ${containerId}:`, error)
          }
        }
      }

      // If we restored containers, don't create demo ones
      if (this.containers.length > 0) return
    }

    // Create demo containers only if no existing demo containers in storage
    // All containers use demo factory for consistent content
    await this.createStringContainer({
      containerId: 'demo-string-container',
      x: 405,
      y: 475,
      width: 310,
      height: 265
    })

    await this.createTemplateContainer({
      containerId: 'demo-template-container',
      x: 515,
      y: 50,
      width: 305,
      height: 305
    })

    await this.createElementContainer({
      containerId: 'demo-element-container',
      x: 855,
      y: 385,
      width: 300,
      height: 250
    })

    await this.createSnappingContainer({
      containerId: 'demo-snapping-container',
      x: 750,
      y: 555,
      width: 315,
      height: 240
    })

    await this.createParentConstrainedContainer()
    await this.createCustomBoundariesContainer()
  }


  /**
   * Create container with custom boundaries
   */
  private async createCustomBoundariesContainer(): Promise<void>
  {
    const config = this.demoFactory.getDemoConfig('demo-custom-boundaries-container')
    if (!config) return

    const content = await this.demoFactory.createDemoContent('demo-custom-boundaries-container', config)

    await this.createContainer({
      x: 1080,
      y: 640,
      width: 300,
      height: 250,
      content,
      type: config.type,
      title: config.title,
      color: config.color,
      useSnapping: config.useSnapping,
      containerId: 'demo-custom-boundaries-container',
      boundaries: {
        minWidth: 200,
        minHeight: 150,
        maxWidth: 500,
        maxHeight: 400
      },
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      },
      isDemoContainer: true
    })
  }

  /**
   * Create parent-constrained container with proper initialization sequence
   */
  private async createParentConstrainedContainer(): Promise<void>
  {
    const config = this.demoFactory.getDemoConfig('demo-parent-constrained-container')
    if (!config) return

    const content = await this.demoFactory.createDemoContent(
      'demo-parent-constrained-container',
      config
    )

    // Create a parent element for demonstration
    const parentElementId = 'parent-demo-parent-constrained-container'
    const parentElement = this.createParentElement(parentElementId)

    // Creating a container inside the parent element
    const container = document.createElement('div')
    container.className = 'container advanced-container new'
    container.style.width = '300px'
    container.style.height = '200px'
    container.style.borderColor = config.color

    // Immediately add the container to the parent element
    parentElement.appendChild(container)

    // Creating a drag-handle
    const {
      dragHandle,
      pinButton,
      directionButton,
      maximizeButton,
      closeButton
    } = this.createEnhancedDragHandle(config.title)

    container.appendChild(dragHandle)

    // Creating content
    const contentElement = document.createElement('div')
    contentElement.className = 'container-content'

    if (typeof content === 'string') {
      contentElement.innerHTML = content
    } else if (content instanceof HTMLElement) {
      contentElement.appendChild(content)
    } else if (content.template) {
      try {
        contentElement.innerHTML = await this.templateLoader.loadTemplate(content.template)
      } catch (error) {
        contentElement.innerHTML = `<div class="template-error">Failed to load template</div>`
      }
    }

    container.appendChild(contentElement)

    const containerId = 'demo-parent-constrained-container'

    this.state.push(containerId)

    // Initialize the manager after the container is added to the DOM
    const manager = new ContainerManager(container, {
      _uid: containerId,
      mode: this.isGlobalPinned ? 'pinned' : 'smooth',
      boundaries: {},
      constrainToViewport: false,
      draggingDirection: 'all',
      constrainToParent: true,
      autoAdjust: {
        enabled: true,
        width: true,
        height: true
      },
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      }
    }) as ContainerManagerInterface

    // Set container metadata for persistence
    container.dataset.containerType = config.type
    container.dataset.title = config.title
    container.dataset.color = config.color
    container.dataset.useSnapping = String(config.useSnapping || false)
    container.dataset.maximized = 'false'

    // Install persistence plugin with demo flag
    manager.use(new StatePersistencePlugin(), {
      containerId: containerId,
      isDemo: true
    })

    // Recalculating for parent restrictions
    manager.recalculateForParent()

    // Installing plugins
    // It's an optional plugin that's not needed in a working project.
    manager.use(new LoggingPlugin(), {
      containerName: config.title,
      notificationSystem: this.notificationSystem
    })

    // Setting up events
    this.setupContainerEvents(manager, container, pinButton, directionButton, maximizeButton, closeButton, containerId)

    // Register container
    this.containers.push({
      element: container,
      manager,
      hasSnapping: config.useSnapping || false,
      type: config.type,
      _uid: containerId,
      containerId,
      isDemoContainer: true
    })

    this.updateStats()
    this.updateSnappingStatus()

    setTimeout(() => {
      container.classList.remove('new')
    }, 300)

    container.addEventListener('click', () => {
      this.state.sort(containerId)

      this.containers.forEach(c => {
        c.element.style.zIndex = this.state.zIndex(c._uid)
      })
    })
  }

  /**
   * Create container with string content
   */
  private async createStringContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    containerId?: string;
  }): Promise<void> {
    const config = this.demoFactory.getDemoConfig(params.containerId!)
    if (!config) return

    const content = await this.demoFactory.createDemoContent(
      params.containerId!,
      config
    )

    await this.createContainer({
      ...params,
      content,
      type: config.type,
      title: config.title,
      color: config.color,
      useSnapping: config.useSnapping,
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      },
      isDemoContainer: true
    })
  }

  /**
   * Create container with template content
   */
  private async createTemplateContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    containerId?: string;
  }): Promise<void> {
    const config = this.demoFactory.getDemoConfig(params.containerId!)
    if (!config) return

    const content = await this.demoFactory.createDemoContent(
      params.containerId!,
      config
    )

    const container = await this.createContainer({
      ...params,
      content,
      type: config.type,
      title: config.title,
      color: config.color,
      useSnapping: config.useSnapping,
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      },
      isDemoContainer: true
    })

    // Add template info to the container if it's a template container
    if (config.template) {
      this.demoFactory.addTemplateInfo(
        container,
        config.template,
        config.useSnapping || false
      )
    }
  }

  /**
   * Create container with DOM element content
   */
  private async createElementContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    containerId?: string;
  }): Promise<void> {
    const config = this.demoFactory.getDemoConfig(params.containerId!)
    if (!config) return

    const content = await this.demoFactory.createDemoContent(
      params.containerId!,
      config
    )

    await this.createContainer({
      ...params,
      content,
      type: config.type,
      title: config.title,
      color: config.color,
      useSnapping: config.useSnapping,
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      },
      isDemoContainer: true
    })
  }

  /**
   * Create special container with snapping plugin
   */
  private async createSnappingContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    containerId?: string;
  }): Promise<void> {
    const config = this.demoFactory.getDemoConfig(params.containerId!)
    if (!config) return

    const content = await this.demoFactory.createDemoContent(
      params.containerId!,
      config
    )

    await this.createContainer({
      ...params,
      content,
      type: config.type,
      title: config.title,
      color: config.color,
      useSnapping: config.useSnapping,
      resize: {
        enabled: true,
        directions: ['n', 'nw', 'se', 'sw']
      },
      isDemoContainer: true
    })
  }

  /**
   * Create user container with string content (NOT a demo container)
   */
  private async createUserStringContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    color?: string;
    useSnapping?: boolean;
    containerId?: string;
  }): Promise<void> {
    const content = `
      <div class="content-section">
        <h4>${params.title}</h4>
        <p>This is a <strong>user-created container</strong> with string content.</p>
        <div class="feature-list">
          <div class="feature-item">✅ Created by user</div>
          <div class="feature-item">✅ String content</div>
          <div class="feature-item">✅ Temporary (not saved)</div>
          <div class="feature-item">${params.useSnapping ? '✅ With Snapping' : '❌ No Snapping'}</div>
        </div>
        <div class="content-info">
          <small>Container ID: <strong>${params.containerId}</strong></small>
        </div>
      </div>`

    await this.createContainer({
      ...params,
      content,
      type: 'string',
      useSnapping: params.useSnapping || false,
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      },
      isDemoContainer: false
    })
  }

  /**
   * Create user container with template content (NOT a demo container)
   */
  private async createUserTemplateContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    template: string;
    color?: string;
    useSnapping?: boolean;
    containerId?: string;
  }): Promise<void> {
    const content = { template: params.template }
    const container = await this.createContainer({
      ...params,
      content,
      type: 'template',
      useSnapping: params.useSnapping || false,
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      },
      isDemoContainer: false
    })

    // Add template info to the container
    const infoElement = document.createElement('div')
    infoElement.className = 'template-info-bar'
    infoElement.innerHTML = `Template: <strong>${params.template}.html</strong> • User Container • ${params.useSnapping ? 'With Snapping' : 'No Snapping'}`

    const contentElement = container.querySelector('.container-content')
    if (contentElement) {
      contentElement.appendChild(infoElement)
    }
  }

  /**
   * Create user container with DOM element content (NOT a demo container)
   */
  private async createUserElementContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    color?: string;
    useSnapping?: boolean;
    containerId?: string;
  }): Promise<void> {
    // Create DOM element programmatically
    const contentElement = document.createElement('div')
    contentElement.className = 'custom-element-content'
    contentElement.innerHTML = `
      <h4>${params.title}</h4>
      <p>This is a <strong>user-created container</strong> with DOM element content.</p>
      <div class="interactive-demo">
        <button class="btn btn-warning demo-btn" id="colorChange">Change Color</button>
        <button class="btn btn-success demo-btn" id="addItem">Add Item</button>
        <div class="item-list" id="itemList"></div>
      </div>
      <div class="user-container-info">
        <small>Container ID: <strong>${params.containerId}</strong></small>
        <br>
        <small>Snapping: <strong>${params.useSnapping ? 'Enabled' : 'Disabled'}</strong></small>
      </div>`

    // Add interactive functionality
    const colorButton = contentElement.querySelector('#colorChange') as HTMLButtonElement
    const addButton = contentElement.querySelector('#addItem') as HTMLButtonElement
    const itemList = contentElement.querySelector('#itemList') as HTMLDivElement

    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57']
    let colorIndex = 0

    contentElement.style.paddingLeft = '7px'
    colorButton.addEventListener('click', () => {
      colorIndex = (colorIndex + 1) % colors.length
      contentElement.style.borderLeft = `4px solid ${colors[colorIndex]}`
    })

    let itemCount = 0
    addButton.addEventListener('click', () => {
      itemCount++

      const item = document.createElement('div')
      item.className = 'list-item'
      item.textContent = `User Item ${itemCount}`
      item.style.animation = 'slideIn 0.3s ease-out'
      itemList.appendChild(item)
    })

    await this.createContainer({
      ...params,
      content: contentElement,
      type: 'element',
      useSnapping: params.useSnapping || false,
      resize: {
        enabled: true,
        directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      },
      isDemoContainer: false
    })
  }

  /**
   * Create user container with snapping plugin (NOT a demo container)
   */
  private async createUserSnappingContainer(params: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    color?: string;
    containerId?: string;
  }): Promise<void> {
    const content = `
      <div class="content-section">
        <h4>${params.title}</h4>
        <p>This is a <strong>user-created container</strong> with snapping functionality.</p>
        <div class="feature-list">
          <div class="feature-item">✅ Created by user</div>
          <div class="feature-item">✅ Snapping enabled</div>
          <div class="feature-item">✅ Temporary (not saved)</div>
          <div class="feature-item">✅ Configurable step size</div>
        </div>
        <div class="snapping-controls-info">
          <p><small>Use the snap step and mode controls in the main panel to configure snapping behavior.</small></p>
        </div>
        <div class="user-container-info">
          <small>Container ID: <strong>${params.containerId}</strong></small>
        </div>
      </div>`

    await this.createContainer({
      ...params,
      content,
      type: 'string',
      useSnapping: true,
      resize: {
        enabled: true,
        directions: ['n', 'nw', 'se', 'sw']
      },
      isDemoContainer: false
    })
  }

  // ---------- MAIN METHOD OF CREATING A CONTAINER ----------

  /**
   * Generic container creation with enhanced features
   */
  private async createContainer(params: ContainerCreationParams): Promise<HTMLElement>
  {
    // const container = document.createElement('div')
    const containerId = params.containerId!

    // Create container element
    const container = ContainerInitializer.createContainerElement(
      params.width,
      params.height,
      params.x,
      params.y,
      params.color
    )

    container.className = 'container advanced-container new'

    // Add to DOM first
    if (params.parentElement) {
      params.parentElement.appendChild(container)
    } else {
      document.body.appendChild(container)
    }

    // Use provided container ID
    // const containerId = params.containerId!
    // if (!params.containerId) {
    //   throw new Error('Container ID is required')
    // }
    //
    // // Set the exact positions and sizes
    // container.style.width = `${params.width}px`
    // container.style.height = `${params.height}px`
    //
    // if (Reflect.has(params, 'x')) {
    //   container.style.left = `${params.x}px`
    // }
    // if (Reflect.has(params, 'y')) {
    //   container.style.top = `${params.y}px`
    // }
    // if (params.color) {
    //   container.style.borderColor = params.color
    // }

    // Create enhanced drag handle
    const {
      dragHandle,
      pinButton,
      directionButton,
      maximizeButton,
      closeButton
    } = this.createEnhancedDragHandle(
      params.title ?? `Container ${this.containers.length + 1}`
    )

    container.appendChild(dragHandle)

    // Add container to appropriate parent
    // if (params.parentElement) {
    //   params.parentElement.appendChild(container)
    // } else {
    //   document.body.appendChild(container)
    // }

    // Creating content after adding it to the DOM
    await this.contentCreator.createContent(params.content, container)

    this.state.push(containerId)

    // Set container metadata for persistence
    container.dataset.containerType = params.type
    container.dataset.title = params.title || ''
    container.dataset.color = params.color || ''
    container.dataset.useSnapping = String(params.useSnapping || false)
    container.dataset.maximized = 'false'
    container.dataset.containerId = containerId

    const shouldConstrainToViewport = params.constrainToViewport ?? !params.constrainToParent
    const isDemoContainer = params.isDemoContainer || this.demoFactory.isDemoContainer(containerId)
    const initialMode = params.mode || (this.isGlobalPinned ? 'pinned' : 'smooth')
    const initialDirection = params.draggingDirection || 'all'

    const manager = new ContainerManager(container, {
      _uid: containerId,
      mode: initialMode,
      boundaries: params.boundaries || {},
      constrainToViewport: shouldConstrainToViewport,
      draggingDirection: initialDirection,
      constrainToParent: params.constrainToParent || false,
      autoAdjust: params.autoAdjust || { enabled: false, width: false, height: false },
      resize: params.resize || { enabled: true, directions: ['se'] }
    }) as ContainerManagerInterface

    // await ContainerInitializer.initializeContainer(
    //   container,
    //   manager,
    //   {
    //     width: params.width,
    //     height: params.height,
    //     x: params.x,
    //     y: params.y
    //   }
    // )

    manager.setState({
      x: params.x || 0,
      y: params.y || 0,
      width: params.width,
      height: params.height
    })

    // Install persistence plugin with demo flag
    manager.use(new StatePersistencePlugin(), {
      containerId,
      isDemo: isDemoContainer
    })

    // Install Edge Docking Plugin
    manager.use(new EdgeDockingPlugin(), {
      containerId,
      edgeThreshold: 30,
      visiblePeek: 20
    })

    // Install the snapping plugin if required
    if (params.useSnapping) {
      manager.use(new SnappingPlugin(), { snapStep: 30, enabled: true })
    }

    // If parental restrictions are enabled then recalculate
    if (params.constrainToParent) {
      manager.recalculateForParent()
    }

    // Setup container events - pass the actual mode and direction for button synchronization
    this.setupContainerEvents(
      manager,
      container,
      pinButton,
      directionButton,
      maximizeButton,
      closeButton,
      containerId,
      initialMode,
      initialDirection
    )

    this.containers.push({
      _uid: containerId,
      containerId,
      element: container,
      hasSnapping: params.useSnapping || false,
      type: params.type,
      isDemoContainer,
      manager
    })

    // Setup hover handlers
    this.setupContainerHoverEvents(container, containerId)

    this.updateStats()
    this.updateSnappingStatus()
    this.updateClosedContainersInfo()

    setTimeout(() => {
      container.classList.remove('new')
    }, 300)

    container.addEventListener('click', () => {
      this.state.sort(containerId)

      this.containers.forEach(c => {
        c.element.style.zIndex = this.state.zIndex(c._uid)
      })
    })

    return container
  }

  // ---------- METHODS FOR CREATING INTERFACE ELEMENTS ----------

  /**
   * Create enhanced drag handle with control buttons
   */
  private createEnhancedDragHandle(title: string): {
    dragHandle: HTMLElement;
    pinButton: HTMLButtonElement;
    directionButton: HTMLButtonElement;
    maximizeButton: HTMLButtonElement;
    closeButton: HTMLButtonElement;
  } {
    const dragHandle = document.createElement('div')
    dragHandle.className = 'drag-handle enhanced-drag-handle'
    dragHandle.setAttribute('data-drag-handle', 'true')

    // Creating a container for the drag-handle content
    const handleContent = document.createElement('div')
    handleContent.className = 'handle-content'

    // Creating the container header
    const titleElement = document.createElement('span')
    titleElement.className = 'container-title'
    titleElement.textContent = title

    // Creating a container for mode control buttons
    const modeControls = document.createElement('div')
    modeControls.className = 'mode-controls-container'

    // Create a direction button
    const directionButton = document.createElement('button')
    directionButton.className = 'mode-btn direction-btn'
    directionButton.innerHTML = this.directionIcon()
    directionButton.title = 'Toggle Direction'
    directionButton.style.backgroundColor = 'transparent'
    modeControls.appendChild(directionButton)

    // Maximize button
    const maximizeButton = document.createElement('button')
    maximizeButton.className = 'mode-btn maximize-btn'
    maximizeButton.innerHTML = '<i class="fa-regular fa-window-maximize"></i>'
    maximizeButton.title = 'Maximize/Restore Container'
    maximizeButton.style.backgroundColor = 'transparent'
    modeControls.appendChild(maximizeButton)

    // Pin button
    const pinButton = document.createElement('button')
    pinButton.className = 'mode-btn pin-btn'
    pinButton.innerHTML = this.pinIcon(this.isGlobalPinned)
    pinButton.title = 'Pin/Unpin Container'
    pinButton.style.backgroundColor = 'transparent'
    modeControls.appendChild(pinButton)

    // Close button
    const closeButton = document.createElement('button')
    closeButton.className = 'mode-btn close-btn'
    closeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>'
    closeButton.title = 'Close Container'
    closeButton.style.backgroundColor = 'transparent'
    modeControls.appendChild(closeButton)

    // Assembling the structure
    handleContent.appendChild(titleElement)
    handleContent.appendChild(modeControls)
    dragHandle.appendChild(handleContent)

    return {
      dragHandle,
      pinButton,
      directionButton,
      maximizeButton,
      closeButton
    }
  }

  private pinIcon(islock = false): string
  {
    return `<i class="fa-solid fa-${islock ? 'lock' : 'lock-open'}"></i>`
  }

  private directionIcon(direction: DirectionMode = 'all')
  {
    return `<i class="fa-solid ${this.dIcons.get(direction)}"></i>`
  }

  // ---------- EVENT HANDLING METHODS FOR CONTAINERS ----------

  /**
   * Set up event handlers for container
   */
  private setupContainerEvents(
    manager: ContainerManagerInterface,
    container: HTMLElement,
    pinButton: HTMLButtonElement,
    directionButton: HTMLButtonElement,
    maximizeButton: HTMLButtonElement,
    closeButton: HTMLButtonElement,
    containerId: string,
    initialMode?: MovementMode,
    initialDirection?: DirectionMode
  ): void {
    // Immediately sync buttons with initial state
    this.syncContainerControlButtons(
      container,
      initialMode || manager.getMode(),
      initialDirection || manager.getDirection()
    )

    const controlButtons = [pinButton, directionButton, maximizeButton, closeButton]

    controlButtons.forEach(button => {
      button.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        this.cancelHideTimeout()
        this.showContainerStats(containerId)
      })

      button.addEventListener('click', (e) => {
        e.stopPropagation()
        this.cancelHideTimeout()
        this.showContainerStats(containerId)
      })

      button.addEventListener('mouseup', (e) => {
        e.stopPropagation()
        this.cancelHideTimeout()
        this.showContainerStats(containerId)
      })
    })

    // Handler for pin button
    pinButton.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()

      const currentMode = manager.getMode()
      const newMode: MovementMode = currentMode === 'pinned' ? 'smooth' : 'pinned'
      const icon: Element = pinButton.firstElementChild

      manager.setMode(newMode)
      container.setAttribute('data-mode', newMode)

      // Updating pin button style
      if (newMode === 'pinned') {
        icon.classList.remove('fa-lock-open')
        icon.classList.add('fa-lock')
      } else {
        icon.classList.remove('fa-lock')
        icon.classList.add('fa-lock-open')
      }

      if (this.currentHoveredContainerId === containerId) {
        this.showContainerStats(containerId)
      }

      this.updateStats()
    })

    // Mousedown handlers to prevent dragging
    pinButton.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    pinButton.addEventListener('touchstart', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    directionButton.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()

      const currentDirection = manager.getDirection()
      const [nextDirection] = this.dIcons.nextEntries(currentDirection)

      manager.setDirection!(nextDirection)

      // Save the state after changing the direction
      const containerInfo = this.containers.find(c => c.containerId === containerId)
      if (containerInfo?.isDemoContainer) {
        StatePersistencePlugin.updateContainerState(containerId, {
          draggingDirection: nextDirection
        })
      }

      // Method for update the icon
      this.updateContainerDirectionButton(container, nextDirection)

      if (this.currentHoveredContainerId === containerId) {
        this.showContainerStats(containerId)
      }

      this.updateStats()
      this.updateSnappingStatus()
    })

    // Mousedown handlers to prevent dragging for direction button
    directionButton.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    directionButton.addEventListener('touchstart', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    // Handler for maximize button
    maximizeButton.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()

      if (this.currentHoveredContainerId === containerId) {
        this.showContainerStats(containerId)
      }

      this.toggleMaximize(manager, container, maximizeButton)
    })

    // Mousedown handlers to prevent dragging for maximize button
    maximizeButton.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    maximizeButton.addEventListener('touchstart', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    // Handler for close button
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.closeContainer(manager, container)
    })

    // Mousedown handlers to prevent dragging for close button
    closeButton.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    closeButton.addEventListener('touchstart', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    const updateContainerStats = () => {
      if (this.currentHoveredContainerId === containerId) {
        this.showContainerStats(containerId)
      }
    }

    manager.on('modeChange', updateContainerStats)
    manager.onPluginEvent('directionChanged', updateContainerStats)
    manager.onPluginEvent('snappingEnabledChanged', updateContainerStats)
    manager.onPluginEvent('snapStepChanged', updateContainerStats)

    // Drag start
    manager.on('dragStart', () => {
      this.isAnyContainerDragging = true
      this.cancelHideTimeout()
      this.showContainerStats(containerId)
    })

    manager.on('drag', (/* event: any */) => {
      // Real-time saving during drag
    })

    // Drag end
    manager.on('dragEnd', () => {
      this.isAnyContainerDragging = false
      this.showContainerStats(containerId)
    })

    // Resize start
    manager.on('resizeStart', () => {
      this.isAnyContainerDragging = true
      this.cancelHideTimeout()
      this.showContainerStats(containerId)
    })

    manager.on('resize', (/* event: any */) => {
      // Real-time saving during resize
    })

    // Resize end
    manager.on('resizeEnd', () => {
      this.isAnyContainerDragging = false
      this.showContainerStats(containerId)
    })

    manager.on('viewportResize', (/* event: any */) => {
      // Container adjusted due to viewport resize
    })

    manager.on('autoAdjust', (/* event: any */) => {
      // Container auto-adjusted to parent
    })

    manager.on('parentRecalculated', (/* event: any */) => {
      // Container recalculated for parent
    })

    // Events for restoring maximize state from persistence
    manager.onPluginEvent('restoreMaximize', (data: { isMaximized: boolean }) => {
      if (data.isMaximized) {
        this.maximizeContainer(manager, container, maximizeButton)
      }
    })
  }

  // ---------- METHODS OF CONTAINER SIZE MANAGEMENT ----------

  /**
   * Toggle maximize/restore for container
   */
  private toggleMaximize(
    manager: ContainerManagerInterface,
    container: HTMLElement,
    maximizeButton: HTMLButtonElement
  ): void {
    const isMaximized = container.dataset.maximized === 'true'

    if (isMaximized) {
      this.restoreContainer(manager, container, maximizeButton)
    } else {
      this.maximizeContainer(manager, container, maximizeButton)
    }
  }

  /**
   * Maximize container to fill viewport - полностью в демо логике
   */
  private maximizeContainer(
    manager: ContainerManagerInterface,
    container: HTMLElement,
    maximizeButton: HTMLButtonElement
  ): void {
    const containerId = container.dataset.containerId!

    // Save current state BEFORE maximize for proper restore
    const currentState = manager.getState()

    // Save the initial state
    this.maximizeStates.set(containerId, {
      originalState: currentState
    })

    // Get viewport dimensions
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Set container to fill viewport
    container.style.position = 'fixed'
    container.style.left = '0'
    container.style.top = '0'
    container.style.width = `${viewportWidth}px`
    container.style.height = `${viewportHeight}px`
    container.style.zIndex = '10000'

    // Update container data
    container.dataset.maximized = 'true'

    const icon = maximizeButton.firstElementChild
    if (icon) {
      icon.classList.remove('fa-window-maximize')
      icon.classList.add('fa-window-restore')
    }

    // Notify persistence plugin
    manager.emitPluginEvent('maximizeChanged', {
      isMaximized: true,
      originalState: currentState
    })

    // Add resize handler for viewport changes
    this.addMaximizeResizeHandler(container)

    // Блокируем resize handles в maximize режиме
    this.toggleResizeHandles(container, false)

    this.updateStats()
    this.notificationSystem.show('Container maximized', 'info')
  }

  /**
   * Restore container to previous state - полностью в демо логике
   */
  private restoreContainer(
    manager: ContainerManagerInterface,
    container: HTMLElement,
    maximizeButton: HTMLButtonElement
  ): void {
    const containerId = container.dataset.containerId!

    // Restore to original state
    const maximizeState = this.maximizeStates.get(containerId)

    if (maximizeState) {
      const originalState = maximizeState.originalState

      container.style.position = 'absolute'
      container.style.left = `${originalState.x}px`
      container.style.top = `${originalState.y}px`
      container.style.width = `${originalState.width}px`
      container.style.height = `${originalState.height}px`
      container.style.zIndex = ''

      // Восстанавливаем исходное состояние в менеджере
      manager.setState(originalState)

      // Удаляем из хранилища
      this.maximizeStates.delete(containerId)
    }

    // Update container data
    container.dataset.maximized = 'false'

    const icon = maximizeButton.firstElementChild
    if (icon) {
      icon.classList.remove('fa-window-restore')
      icon.classList.add('fa-window-maximize')
    }

    // Notify persistence plugin
    manager.emitPluginEvent('maximizeChanged', {
      isMaximized: false
    })

    // Remove resize handler
    this.removeMaximizeResizeHandler(container)

    // Разблокируем resize handles
    this.toggleResizeHandles(container, true)

    this.updateStats()
    this.notificationSystem.show('Container restored', 'info')
  }

  /**
   * Add resize handler for maximized container
   */
  private addMaximizeResizeHandler(container: HTMLElement): void {
    const handler = () => {
      if (container.dataset.maximized === 'true') {
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        container.style.width = `${viewportWidth}px`
        container.style.height = `${viewportHeight}px`
      }
    }

    // Store handler for later removal
    const containerId = container.dataset.containerId
    if (containerId) {
      const maximizeState = this.maximizeStates.get(containerId)

      if (maximizeState) {
        maximizeState.resizeHandler = handler
      }

      window.addEventListener('resize', handler)
    }
  }

  /**
   * Remove resize handler for restored container
   */
  private removeMaximizeResizeHandler(container: HTMLElement): void
  {
    const containerId = container.dataset.containerId

    if (containerId) {
      const maximizeState = this.maximizeStates.get(containerId)

      if (maximizeState?.resizeHandler) {
        window.removeEventListener('resize', maximizeState.resizeHandler)
        maximizeState.resizeHandler = undefined
      }
    }
  }

  /**
   * Toggle resize handles visibility
   */
  private toggleResizeHandles(container: HTMLElement, enabled: boolean): void {
    const resizeHandles = container.querySelectorAll('.resize-handle') as NodeListOf<HTMLElement>

    resizeHandles.forEach(handle => {
      if (enabled) {
        handle.style.display = 'block'
        handle.style.pointerEvents = 'auto'
      } else {
        handle.style.display = 'none'
        handle.style.pointerEvents = 'none'
      }
    })
  }

  // ---------- DATA INPUT METHODS ----------

  /**
   * Bind events for step input with value validation
   */
  private bindStepInputEvents(input: HTMLInputElement, length: number = 20): void
  {
    const allowedValues = this.getAllowedValues(length)

    const handleValueValidation = () => {
      this.validateAndAdjustInputValue(input, allowedValues)
    }

    this.setupInputEventHandlers(input, handleValueValidation, allowedValues)
  }

  /**
   * Generate array of allowed values for step input
   */
  private getAllowedValues(length: number): number[]
  {
    return [1, ...Array.from({ length }, (_, i) => (i + 1) * 5)]
  }

  /**
   * Validate input value and adjust to nearest allowed value
   */
  private validateAndAdjustInputValue(input: HTMLInputElement, allowedValues: number[]): void
  {
    (document.activeElement as HTMLElement).blur()

    const currentValue = Number(input.value)

    if (!allowedValues.includes(currentValue)) {
      input.value = this.findClosestValue(currentValue, allowedValues).toString()
    }
  }

  /**
   * Find closest allowed value to current input
   */
  private findClosestValue(currentValue: number, allowedValues: number[]): number
  {
    return allowedValues.reduce((prev, curr) =>
      Math.abs(curr - currentValue) < Math.abs(prev - currentValue) ? curr : prev
    )
  }

  /**
   * Setup all event handlers for step input
   */
  private setupInputEventHandlers(
    input: HTMLInputElement,
    validationHandler: () => void,
    allowedValues: number[]
  ): void {
    input.addEventListener('keydown', (event) => {
      this.handleStepInputKeyDown(event, input, allowedValues)
    })

    input.addEventListener('blur', validationHandler)
    input.addEventListener('change', () => input.focus())
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') validationHandler()
    })

    clickOutside(input, validationHandler)
  }

  /**
   * Handle keyboard navigation for step input
   */
  private handleStepInputKeyDown(
    event: KeyboardEvent,
    input: HTMLInputElement,
    allowedValues: number[]
  ): void {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return

    event.preventDefault()

    this.adjustStepValue(event.key, input, allowedValues)
  }

  /**
   * Adjust step value based on arrow key direction
   */
  private adjustStepValue(
    direction: string,
    input: HTMLInputElement,
    allowedValues: number[]
  ): void {
    let currentIndex = allowedValues.indexOf(Number(input.value))

    if (currentIndex === -1) {
      currentIndex = allowedValues.findIndex(v => v > Number(input.value))
      if (currentIndex === -1) {
        currentIndex = allowedValues.length - 1
      }
    }

    if (direction === 'ArrowUp' && currentIndex < allowedValues.length - 1) {
      input.value = `${allowedValues[currentIndex + 1]}`
    } else if (direction === 'ArrowDown' && currentIndex > 0) {
      input.value = `${allowedValues[currentIndex - 1]}`
    }
  }

  // ---------- INTERFACE UPDATE METHODS ----------

  /**
   * Update snapping status display
   */
  private updateSnappingStatus(): void
  {
    const snappingStatus = document.getElementById('snappingStatus')
    if (!snappingStatus) return

    const snapStepInput = document.getElementById('snapStep') as HTMLInputElement
    const snapModeSelect = document.getElementById('snapMode') as HTMLSelectElement

    if (snapStepInput && snapModeSelect) {
      const step = snapStepInput.value
      const mode = snapModeSelect.options[snapModeSelect.selectedIndex].text
      snappingStatus.textContent = `Current: ${mode}, Step: ${step}px`
    }
  }

  /**
   * Bind global event listeners
   */
  private bindGlobalEvents(): void
  {
    this.pinButton!.addEventListener('click', () => {
      this.isGlobalPinned = !this.isGlobalPinned
      this.toggleGlobalPinnedMode()
    })

    // User container creations
    document.getElementById('addStringContainer')!
      .addEventListener('click', async () => {
        await this.createUserStringContainer({
          x: 50 + Math.random() * 500,
          y: 50 + Math.random() * 300,
          width: 310,
          height: 240,
          title: 'User String Container',
          color: this.getRandomColor(),
          useSnapping: false,
          containerId: `user-string-${Date.now()}`
        })
      })

    document.getElementById('addTemplateContainer')!
      .addEventListener('click', async () => {
        const templates = ['media', 'stats', 'tasks']
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)]

        await this.createUserTemplateContainer({
          x: 50 + Math.random() * 500,
          y: 50 + Math.random() * 300,
          width: 320,
          height: 290,
          title: 'User Template Container',
          template: randomTemplate,
          color: this.getRandomColor(),
          useSnapping: false,
          containerId: `user-template-${Date.now()}`
        })
      })

    document.getElementById('addElementContainer')!
      .addEventListener('click', async () => {
        await this.createUserElementContainer({
          x: 50 + Math.random() * 500,
          y: 50 + Math.random() * 300,
          width: 280,
          height: 260,
          title: 'User DOM Element Container',
          color: this.getRandomColor(),
          useSnapping: Math.random() > .5,
          containerId: `user-element-${Date.now()}`
        })
      })

    document.getElementById('addSnappingContainer')!
      .addEventListener('click', async () => {
        await this.createUserSnappingContainer({
          x: 50 + Math.random() * 500,
          y: 50 + Math.random() * 300,
          width: 300,
          height: 250,
          title: 'User Snapping Container',
          color: this.getRandomColor(),
          containerId: `user-snapping-${Date.now()}`
        })
      })

    // Add event listener for restore container button
    document.getElementById('restoreContainer')
      ?.addEventListener('click', async () => {
        await this.restoreLastClosedContainer()
      })

    document.getElementById('clearStorage')
      ?.addEventListener('click', () => {
        StatePersistencePlugin.clearStorage()
        this.notificationSystem.show('LocalStorage cleared', 'success')
        this.updateClosedContainersInfo()

        // Reload the page to reset to default state
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      })

    document.getElementById('clearCache')
      ?.addEventListener('click', () => {
        this.templateLoader.clearCache()
        this.notificationSystem.show('Template cache cleared', 'success')
      })

    document.getElementById('clearAll')
      ?.addEventListener('click', () => {
        this.containers.forEach(({ manager }) => manager.destroy())
        this.containers = []

        // Remove only containers, not parent elements
        document.querySelectorAll('.container').forEach(el => el.remove())

        this.updateStats()
        this.updateSnappingStatus()
        this.updateClosedContainersInfo()
        this.notificationSystem.show('All containers cleared', 'info')
      })

    document.getElementById('snapStep')
      ?.addEventListener('input', (e) => {
        const step = parseInt((e.target as HTMLInputElement).value)
        this.setAllContainersSnapStep(step)
        this.updateStats()
        this.updateSnappingStatus()
      })

    document.getElementById('snapMode')
      ?.addEventListener('change', (e) => {
        const mode = (e.target as HTMLSelectElement).value as DirectionMode
        this.setAllContainersDirectionMode(mode)
        this.updateStats()
        this.updateSnappingStatus()
      })
  }

  /**
   * Close container and clean up resources including persistence
   */
  private closeContainer(manager: ContainerManagerInterface, container: HTMLElement): void
  {
    // Find container index in the containers array
    const containerIndex = this.containers.findIndex(c => c.manager === manager)
    if (containerIndex === -1) {
      console.warn('Container not found in containers array')
      return
    }

    const containerId = this.containers[containerIndex].containerId
    const isDemoContainer = this.containers[containerIndex].isDemoContainer

    // Save current state before closing with updated position and size
    // For demo containers, use the plugin method
    if (isDemoContainer) {
      StatePersistencePlugin.saveContainerStateBeforeClose(manager, containerId)
    } else {
      // For non-demo containers, just remove from tracking
      StatePersistencePlugin.containers = StatePersistencePlugin.containers.filter(
        c => c.containerId !== containerId
      )
    }

    // Remove container from DOM with animation
    container.style.animation = 'fadeOut 0.3s ease-out'

    setTimeout(() => {
      manager.destroy()

      // Remove resize handler if container was maximized
      this.removeMaximizeResizeHandler(container)

      if (container.parentNode) {
        container.parentNode.removeChild(container)
      }

      // Remove container from containers array
      this.containers.splice(containerIndex, 1)

      this.updateStats()
      this.updateSnappingStatus()
      this.updateClosedContainersInfo()
      this.notificationSystem.show('Container closed', 'info')

      console.log(`[Demo] Container ${containerId} closed and removed`)
    }, 250)
  }

  /**
   * Method for switching global pinned mode
   */
  private toggleGlobalPinnedMode(): void
  {
    const newMode: MovementMode = this.isGlobalPinned ? 'pinned' : 'smooth'

    // Updating text and style of the button
    if (this.isGlobalPinned) {
      this.pinButton!.classList.add('btn-active')
    } else {
      this.pinButton!.classList.remove('btn-active')
    }

    // Setting the mode for all containers
    this.containers.forEach(({ manager, element }) => {
      manager.setMode(newMode)

      // Update individual pin buttons
      const pinButton = element.querySelector('.pin-btn') as HTMLButtonElement
      const icon: Element = pinButton?.firstElementChild

      if (icon) {
        if (newMode === 'pinned') {
          icon.classList.remove('fa-lock-open')
          icon.classList.add('fa-lock')
        } else {
          icon.classList.remove('fa-lock')
          icon.classList.add('fa-lock-open')
        }
      }

      element.setAttribute('data-mode', newMode)
    })

    this.updateStats()
  }

  /**
   * Set snap step for all containers with snapping
   */
  private setAllContainersSnapStep(step: number): void
  {
    this.containers.forEach(({ manager, hasSnapping }) => {
      if (hasSnapping) {
        manager.setSnapStep?.(step)
      }
    })
  }

  /**
   * Set direction mode for all containers and update their direction buttons
   */
  private setAllContainersDirectionMode(direction: DirectionMode): void
  {
    this.containers.forEach(({ manager, element, containerId, isDemoContainer }) => {
      manager.setDirection(direction)

      // Save state for demo containers
      if (isDemoContainer) {
        StatePersistencePlugin.updateContainerState(containerId, {
          draggingDirection: direction
        })
      }

      // Update direction button icon for this container
      this.updateContainerDirectionButton(element, direction)
    })
  }

  /**
   * Update direction button icon for a specific container
   */
  private updateContainerDirectionButton(container: HTMLElement, direction: DirectionMode): void
  {
    const directionButton = container.querySelector('.direction-btn') as HTMLButtonElement
    if (!directionButton) return

    const icon = directionButton.firstElementChild
    if (!icon) return

    // Remove all direction icon classes
    const allIcons = ['fa-up-down-left-right', 'fa-left-right', 'fa-up-down']
    allIcons.forEach(iconClass => icon.classList.remove(iconClass))

    // Add the correct icon class
    const newIconClass = this.dIcons.get(direction)
    if (newIconClass) {
      icon.classList.add(newIconClass)
    }

    // Update button title for accessibility
    directionButton.title = `Movement Direction: ${direction}`
  }

  // ---------- METHOD OF UPDATING STATISTICS ----------

  /**
   * Update statistics to include maximized containers count
   */
  private updateStats(): void
  {
    this.statsManager.showGlobalStats(this.getGlobalStats())
  }

  // ---------- UTILITY TOOLS ----------

  /**
   * Generate random color
   */
  private getRandomColor(): string
  {
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
      '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ]

    return colors[Math.floor(Math.random() * colors.length)]
  }

  /**
   * Clean up demo
   */
  destroy(): void
  {
    this.containers.forEach(({ manager }) => manager.destroy())
    this.containers = []
  }
}

// (window as any).DEBUG_CONTAINER_MANAGER = true

ContainerManagerDemo.init().catch(console.error)

document.addEventListener('mousemove', (e) => {
  (window as any).lastMouseX = e.clientX;
  (window as any).lastMouseY = e.clientY;
})
