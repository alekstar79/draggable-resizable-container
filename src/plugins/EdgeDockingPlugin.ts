// src/plugins/EdgeDockingPlugin.ts

import type { ContainerManagerInterface, ContainerManagerPlugin, ContainerState } from '../core/types'
import { getStyles } from '../utils'

export interface EdgeDockingPluginOptions {
  enabled?: boolean;
  edgeThreshold?: number;
  visiblePeek?: number;
}

export interface Styles {
  width: number | string | boolean | null
  height: number | string | boolean | null
  top: number | string | boolean | null
  right: number | string | boolean | null
  bottom: number | string | boolean | null
  left: number | string | boolean | null
}

export type DockEdge = keyof Omit<Styles, 'width' | 'height'>

export class EdgeDockingPlugin implements ContainerManagerPlugin
{
  private static edgeWrappers: Map<DockEdge, HTMLElement> = new Map()
  private static dockedContainers: Map<DockEdge, ContainerManagerInterface> = new Map()
  private static isInitialized: boolean = false

  private options: Required<EdgeDockingPluginOptions>
  private manager?: ContainerManagerInterface

  private originalState = {} as ContainerState
  private transformState = {} as ContainerState
  private dockState: ContainerState | null = null
  private undockState: ContainerState | null = null

  private containerId?: string
  private dockedId: number | null = null

  constructor(options: EdgeDockingPluginOptions = {})
  {
    this.options = {
      enabled: true,
      edgeThreshold: 30,
      visiblePeek: 20,
      ...options
    }
  }

  install(manager: ContainerManagerInterface, options?: { containerId: string }): void
  {
    this.containerId = options?.containerId
    this.manager = manager

    if (!EdgeDockingPlugin.isInitialized) {
      EdgeDockingPlugin.initializeEdgeSystem()
      EdgeDockingPlugin.isInitialized = true
    }

    this.bindContainerEvents()

    void this.containerId
  }

  /**
   * Initialization of the system with correct positioning
   */
  private static initializeEdgeSystem(): void
  {
    const edges: DockEdge[] = ['top', 'right', 'bottom', 'left']

    edges.forEach(edge => {
      const wrapper = document.createElement('div')
      wrapper.className = `edge-docking-wrapper ${edge}-edge`

      Object.assign(wrapper.style, {
        position: 'fixed',
        background: 'transparent',
        border: 'none',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: '9998',
        transition: 'all 0.3s ease'
      })

      // Positioning the wrapper based on peek
      this.positionEdgeWrapper(wrapper, edge, false)
      document.body.appendChild(wrapper)
      EdgeDockingPlugin.edgeWrappers.set(edge, wrapper)

      // Creating a edge-docking-zone
      const zone = document.createElement('div')
      zone.className = `edge-docking-zone ${edge}-zone`

      Object.assign(zone.style, {
        position: 'fixed',
        background: 'transparent',
        pointerEvents: 'auto',
        cursor: 'default',
        zIndex: '10',
        opacity: '0',
        transition: 'opacity 0.2s ease, background-color 0.2s ease'
      })

      // Positioning the zone
      this.positionEdgeZone(zone, edge)
      document.body.appendChild(zone)

      this.bindZoneEvents(zone, wrapper, edge)
    })
  }

  /**
   * Positioning edge-docking-wrapper
   */
  private static positionEdgeWrapper(
    wrapper: HTMLElement,
    edge: DockEdge,
    isVisible: boolean
  ): void {
    if (!wrapper.firstElementChild) return

    const peek = 20
    const props: Array<keyof Styles> = ['height', 'width']
    const containerStyles = getStyles<(keyof Styles)[]>(
      wrapper.firstElementChild,
      props
    )

    switch (edge) {
      case 'top':
        Object.assign(wrapper.style, {
          top: '0',
          left: '0',
          right: '0',
          height: containerStyles.height,
          transform: isVisible ? `translateY(${peek}px)`: `translateY(calc(-100% + ${peek}px))`
        })
        break
      case 'bottom':
        Object.assign(wrapper.style, {
          bottom: '0',
          left: '0',
          right: '0',
          height: containerStyles.height,
          transform: isVisible ? `translateY(-${peek}px)` : `translateY(calc(100% - ${peek}px))`
        })
        break
      case 'left':
        Object.assign(wrapper.style, {
          top: '0',
          left: '0',
          bottom: '0',
          width: containerStyles.width,
          transform: isVisible ? `translateX(${peek}px)` : `translateX(calc(-100% + ${peek}px))`
        })
        break
      case 'right':
        Object.assign(wrapper.style, {
          top: '0',
          right: '0',
          bottom: '0',
          width: containerStyles.width,
          transform: isVisible ? `translateX(-${peek}px)` : `translateX(calc(100% - ${peek}px))`
        })
    }
  }

  /**
   * Positioning edge-docking-zone
   */
  private static positionEdgeZone(zone: HTMLElement, edge: DockEdge): void
  {
    const threshold = 30

    switch (edge) {
      case 'top':
        Object.assign(zone.style, { top: '0', left: '0', right: '0', height: `${threshold}px` })
        break
      case 'bottom':
        Object.assign(zone.style, { bottom: '0', left: '0', right: '0', height: `${threshold}px` })
        break
      case 'left':
        Object.assign(zone.style, { top: '0', left: '0', bottom: '0', width: `${threshold}px` })
        break
      case 'right':
        Object.assign(zone.style, { top: '0', right: '0', bottom: '0', width: `${threshold}px` })
    }
  }

  /**
   * Events for the edge-docking-zone
   */
  private static bindZoneEvents(
    zone: HTMLElement,
    wrapper: HTMLElement,
    edge: DockEdge
  ): void {
    let hideTimeout: number

    const showWrapper = () => {
      clearTimeout(hideTimeout)

      // Show the wrapper only if it has a container
      if (EdgeDockingPlugin.dockedContainers.has(edge)) {
        wrapper.style.pointerEvents = 'auto'
        this.positionEdgeWrapper(wrapper, edge, true)
        zone.style.background = 'rgba(59, 130, 246, 0.1)'
        zone.style.opacity = '1'
      }
    }

    const hideWrapper = () => {
      hideTimeout = window.setTimeout(() => {
        // Hide only if the cursor is not on the wrapper or the area
        if (!wrapper.matches(':hover') && !zone.matches(':hover')) {
          wrapper.style.pointerEvents = 'none'
          this.positionEdgeWrapper(wrapper, edge, false)
          zone.style.background = 'transparent'
          zone.style.opacity = '0'
        }
      }, 300)
    }

    // Zone Events
    zone.addEventListener('mouseenter', showWrapper)
    zone.addEventListener('mouseleave', hideWrapper)

    // Wrapper Events
    wrapper.addEventListener('mouseenter', () => {
      clearTimeout(hideTimeout)
    })

    wrapper.addEventListener('mouseleave', hideWrapper)
  }

  /**
   * Container Events
   */
  private bindContainerEvents(): void
  {
    if (!this.manager) return

    this.manager.on('dragStart', () => {
      const currentEdge = this.getCurrentDockEdge()
      if (currentEdge) {
        this.undock(currentEdge)
      }
    })

    this.manager.on('dragEnd', () => {
      if (this.options.enabled) {
        this.tryDock()
      }
    })
  }

  /**
   * Trying to dock the container
   */
  private tryDock(): void
  {
    if (!this.manager) return

    const container = this.manager.getContainer()
    const rect = container.getBoundingClientRect()
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }

    // Checking the distance to the edges
    const distances = {
      top: rect.top,
      right: viewport.width - rect.right,
      bottom: viewport.height - rect.bottom,
      left: rect.left
    }

    // Looking for the nearest available edge
    let closestEdge: DockEdge | null = null
    let minDistance = this.options.edgeThreshold

    for (const [edge, distance] of Object.entries(distances) as [DockEdge, number][]) {
      if (distance <= minDistance && !EdgeDockingPlugin.dockedContainers.has(edge)) {
        closestEdge = edge
        minDistance = distance
      }
    }

    if (closestEdge) {
      this.dock(closestEdge)
    }
  }

  /**
   * Dock the container to the edge
   */
  private dock(edge: DockEdge): void
  {
    if (!this.manager) return

    const wrapper = EdgeDockingPlugin.edgeWrappers.get(edge)
    const container = this.manager.getContainer()

    if (!wrapper) return

    this.originalState = { ...this.manager.getState() }

    const docked = () => {
      this.manager?.setState(this.dockState!)

      window.removeEventListener('docked', docked)
      this.dockedId && clearTimeout(this.dockedId)
      this.dockedId = null
    }

    const undocked = () => {
      this.manager?.setState(this.undockState!)

      window.removeEventListener('undocked', undocked)
      this.dockedId && clearTimeout(this.dockedId)
      this.dockedId = null
    }

    window.addEventListener('undocked', undocked)
    window.addEventListener('docked', docked)

    // Moving the container to the wrapper
    wrapper.appendChild(container)

    setTimeout(() => {
      this.setupDockedPositioning(container, edge)
    }, 10)

    // Updating the status
    EdgeDockingPlugin.dockedContainers.set(edge, this.manager)

    // Show wrapper immediately after docking
    wrapper.style.pointerEvents = 'auto'
    EdgeDockingPlugin.positionEdgeWrapper(wrapper, edge, true)
  }

  /**
   * Setup positioning of the docked container
   */
  private setupDockedPositioning(container: HTMLElement, edge: DockEdge): void
  {
    if (!this.manager) return

    Object.assign(container.style, {
      position: 'absolute',
      left: 'auto',
      top: 'auto',
      right: 'auto',
      bottom: 'auto',
      margin: '0',
      transform: 'none'
    })

    switch (edge) {
      case 'top':
        container.style.bottom = '0'
        container.style.left = '50%'
        container.style.transform = 'translateX(-50%)'
        container.style.inset = 'auto auto 0 50%'
        break
      case 'bottom':
        container.style.top = '0'
        container.style.left = '50%'
        container.style.transform = 'translateX(-50%)'
        container.style.inset = '0 auto auto 50%'
        break
      case 'left':
        container.style.right = '0'
        container.style.top = '50%'
        container.style.transform = 'translateY(-50%)'
        container.style.inset = '50% 0 auto auto'
        break
      case 'right':
        container.style.left = '0'
        container.style.top = '50%'
        container.style.transform = 'translateY(-50%)'
        container.style.inset = '50% auto auto 0'
        break
    }

    // Visual indicators
    container.style.border = '2px solid rgba(59, 130, 246, 0.3)'
    container.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
    container.dataset.docked = 'true'
    container.dataset.dockEdge = edge

    this.transformState = {
      ...this.originalState,
      ...getStyles(container, { left: 'x', top: 'y' }, true)
    } as ContainerState

    this.calcDockState(edge)
    this.calcUndockState(edge)
    this.handleDispatch('docked')
  }

  private calcDockState(edge: DockEdge): void
  {
    const coords = { x: 0, y: 0 }

    switch (edge) {
      case 'top':
        coords.x = this.transformState.x - (this.transformState.width / 2)
        break
      case 'bottom':
        coords.x = this.transformState.x - (this.transformState.width / 2)
        break
      case 'left':
        coords.y = this.transformState.y - (this.transformState.height / 2)
        break
      case 'right':
        coords.y = this.transformState.y - (this.transformState.height / 2)
    }

    this.dockState = {
      ...this.transformState,
      ...coords
    }
  }

  private calcUndockState(edge: DockEdge): void
  {
    const coords = { x: 0, y: 0 }

    switch (edge) {
      case 'top':
        coords.x = this.transformState.x - (this.transformState.width / 2)
        break
      case 'bottom':
        coords.x = this.transformState.x - (this.transformState.width / 2)
        coords.y = this.originalState.y - 20
        break
      case 'left':
        coords.y = this.transformState.y - (this.transformState.height / 2)
        break
      case 'right':
        coords.y = this.transformState.y - (this.transformState.height / 2)
        coords.x = this.originalState.x - 20
    }

    this.undockState = {
      ...this.transformState,
      ...coords
    }
  }

  private handleDispatch(event: 'docked' | 'undocked')
  {
    if (typeof this.dockedId !== 'number') {
      this.dockedId = window.setTimeout(() => {
        this.dispatch(event)
      })
    }
  }

  private dispatch(event: 'docked' | 'undocked'): void
  {
    window.dispatchEvent(
      new CustomEvent(event, {
        bubbles: false,
        cancelable: true,
        composed: true
      })
    )
  }

  /**
   * Undocking container
   */
  private undock(edge: DockEdge): void
  {
    const manager = EdgeDockingPlugin.dockedContainers.get(edge)
    if (!manager || manager !== this.manager) return

    const wrapper = EdgeDockingPlugin.edgeWrappers.get(edge)
    const container = manager.getContainer()

    if (wrapper && container.parentElement === wrapper) {
      document.body.appendChild(container)

      // Restoring styles
      this.restoreContainerStyles(container, edge)

      // Restoring the state
      if (this.undockState) {
        this.handleDispatch('undocked')
      }

      EdgeDockingPlugin.dockedContainers.delete(edge)
      EdgeDockingPlugin.positionEdgeWrapper(wrapper, edge, false)
      wrapper.style.pointerEvents = 'none'
    }
  }

  /**
   * Restoring container styles
   */
  private restoreContainerStyles(container: HTMLElement, edge: DockEdge): void
  {
    const left = edge === 'top' || edge === 'bottom'
      ? `${this.undockState!.x}px`
      : ''

    const top = edge === 'left' || edge === 'right'
      ? `${this.undockState!.y}px`
      : ''

    container.style.position = 'absolute'
    container.style.margin = ''
    container.style.transform = ''
    container.style.top = top
    container.style.bottom = ''
    container.style.left = left
    container.style.right = ''
    container.style.border = ''
    container.style.boxShadow = ''
    delete container.dataset.docked
    delete container.dataset.dockEdge
  }

  /**
   * Get the current edge to which the container is docked
   */
  private getCurrentDockEdge(): DockEdge | null
  {
    for (const [edge, manager] of EdgeDockingPlugin.dockedContainers.entries()) {
      if (manager === this.manager) {
        return edge
      }
    }
    return null
  }

  destroy(): void
  {
    const currentEdge = this.getCurrentDockEdge()
    if (currentEdge) {
      this.undock(currentEdge)
    }
  }

  static destroySystem(): void
  {
    EdgeDockingPlugin.dockedContainers
      .forEach((manager, edge) => {
        const wrapper = EdgeDockingPlugin.edgeWrappers.get(edge)
        const container = manager.getContainer()

        if (wrapper && container.parentElement === wrapper) {
          document.body.appendChild(container)
        }
      })

    EdgeDockingPlugin.dockedContainers.clear()
    EdgeDockingPlugin.edgeWrappers.forEach(wrapper => wrapper.remove())
    EdgeDockingPlugin.edgeWrappers.clear()
    EdgeDockingPlugin.isInitialized = false
  }
}
