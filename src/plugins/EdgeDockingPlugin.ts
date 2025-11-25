// src/plugins/EdgeDockingPlugin.ts

import { Plugin, ContainerManagerInterface } from '../core/types'
import { type IEdgeController, createTracker } from '../utils'

export type Edge = 'top' | 'bottom' | 'left' | 'right'

export interface DockedContainer {
  element: HTMLElement
  originalPosition: {
    top: number
    left: number
    width: number
    height: number
    transform: string
    position: string
  }
  edge: Edge
  screenPosition: {
    x: number
    y: number
  }
}

export interface EdgeDockingConfig {
  edgeThreshold?: number
  visiblePeek?: number
  animationDuration?: number
  enabled?: boolean
}

export class EdgeDockingPlugin implements Plugin
{
  private static _pluginId: Symbol = Symbol('EdgeDockingPlugin')

  get pluginId(): Symbol {
    return EdgeDockingPlugin._pluginId
  }

  private dockedContainers = new Map<HTMLElement, DockedContainer>()
  private occupiedEdges = new Map<Edge, HTMLElement | null>()
  private tracker: IEdgeController = createTracker({ emitter: true, edgeThreshold: 20 })
  private manager!: ContainerManagerInterface

  private readonly edgeThreshold: number

  constructor(config: EdgeDockingConfig = {})
  {
    this.edgeThreshold = config.edgeThreshold ?? 30

    // Initialize all edges as available
    this.occupiedEdges.set('top', null)
    this.occupiedEdges.set('bottom', null)
    this.occupiedEdges.set('left', null)
    this.occupiedEdges.set('right', null)
  }

  install(manager: ContainerManagerInterface): void
  {
    this.manager = manager

    // Set up edge tracking
    this.tracker.addTarget(this.manager.getContainer())

    // Subscribe to edge events for visual feedback
    this.tracker.on('edge:enter', (data) => {
      if (data.source === 'element' && data.element === this.manager.getContainer()) {
        this.handleEdgeEnter(data.edge!)
      }
    })

    this.tracker.on('edge:leave', (data) => {
      if (data.source === 'element' && data.element === this.manager.getContainer()) {
        this.handleEdgeLeave(data.edge!)
      }
    })

    this.attachEventHandlers()
  }

  /**
   * Handle edge enter for visual feedback
   */
  private handleEdgeEnter(edge: Edge): void
  {
    const element = this.manager.getContainer()

    if (this.isEdgeOccupied(edge)) {
      // Edge is occupied - show blocked hint
      element.classList.add('edge-dock-hint', `edge-dock-hint-${edge}`, 'edge-dock-blocked')
    } else {
      // Edge is available - show available hint
      element.classList.add('edge-dock-hint', `edge-dock-hint-${edge}`)
    }
  }

  /**
   * Handle edge leave - remove visual feedback
   */
  private handleEdgeLeave(edge: Edge): void
  {
    const element = this.manager.getContainer()
    element.classList.remove('edge-dock-hint', `edge-dock-hint-${edge}`, 'edge-dock-blocked')
  }

  /**
   * Check if an edge is occupied by another container
   */
  private isEdgeOccupied(edge: Edge): boolean
  {
    return this.occupiedEdges.get(edge) !== null
  }

  /**
   * Attach event handlers to container manager
   */
  private attachEventHandlers(): void
  {
    // Add mouse events for hover behavior
    const container = this.manager.getContainer()
    container.addEventListener('mouseenter', this.onMouseEnter.bind(this))
    container.addEventListener('mouseleave', this.onMouseLeave.bind(this))

    this.manager.on('dragStart', (data: any) => {
      this.onDragStart(data.element)
    })

    this.manager.on('drag', (data: any) => {
      this.onDrag(data.element)
    })

    this.manager.on('dragEnd', (data: any) => {
      this.onDragEnd(data.element)
    })
  }

  /**
   * Handle mouse enter - show docked container
   */
  private onMouseEnter(): void
  {
    const element = this.manager.getContainer()
    if (this.isContainerDocked(element)) {
      element.classList.add('edge-docked-visible')
    }
  }

  /**
   * Handle mouse leave - hide docked container
   */
  private onMouseLeave(): void
  {
    const element = this.manager.getContainer()
    if (this.isContainerDocked(element)) {
      element.classList.remove('edge-docked-visible')
    }
  }

  /**
   * Handle drag start - undock if docked
   */
  private onDragStart(element: HTMLElement): void
  {
    // Remove any edge hints and visibility
    element.classList.remove(
      'edge-dock-hint', 'edge-dock-blocked', 'edge-docked-visible',
      'edge-dock-hint-top', 'edge-dock-hint-bottom',
      'edge-dock-hint-left', 'edge-dock-hint-right'
    )

    const docked = this.dockedContainers.get(element)
    if (docked) {
      this.undockContainer(element, docked)
    }
  }

  /**
   * Handle drag - update edge hints based on position
   */
  private onDrag(element: HTMLElement): void
  {
    const rect = element.getBoundingClientRect()
    const edge = this.getClosestEdge(rect)

    // Update visual hints based on current position
    this.updateEdgeHints(element, edge)
  }

  /**
   * Handle drag end - dock if close to edge
   */
  private onDragEnd(element: HTMLElement): void
  {
    const rect = element.getBoundingClientRect()
    const edge = this.getClosestEdge(rect)

    // Remove all hints
    element.classList.remove(
      'edge-dock-hint', 'edge-dock-blocked',
      'edge-dock-hint-top', 'edge-dock-hint-bottom',
      'edge-dock-hint-left', 'edge-dock-hint-right'
    )

    if (edge && !this.isEdgeOccupied(edge)) {
      this.dockContainer(element, edge)
    }
  }

  /**
   * Update visual hints for edge docking
   */
  private updateEdgeHints(element: HTMLElement, activeEdge: Edge | null): void
  {
    // Remove all existing hints
    element.classList.remove(
      'edge-dock-hint', 'edge-dock-blocked',
      'edge-dock-hint-top', 'edge-dock-hint-bottom',
      'edge-dock-hint-left', 'edge-dock-hint-right'
    )

    if (activeEdge) {
      if (this.isEdgeOccupied(activeEdge)) {
        element.classList.add('edge-dock-hint', `edge-dock-hint-${activeEdge}`, 'edge-dock-blocked')
      } else {
        element.classList.add('edge-dock-hint', `edge-dock-hint-${activeEdge}`)
      }
    }
  }

  /**
   * Get the closest edge to the container
   */
  private getClosestEdge(rect: DOMRect): Edge | null
  {
    const distTop = rect.top
    const distLeft = rect.left
    const distBottom = window.innerHeight - rect.bottom
    const distRight = window.innerWidth - rect.right

    const distances = {
      top: distTop,
      bottom: distBottom,
      left: distLeft,
      right: distRight
    }

    const validEdges = Object.entries(distances)
      .filter(([_, dist]) => dist >= -this.edgeThreshold && dist <= this.edgeThreshold)
      .sort((a, b) => a[1] - b[1])

    return validEdges.length > 0
      ? validEdges[0][0] as Edge
      : null
  }

  /**
   * Dock container to specified edge
   */
  private dockContainer(element: HTMLElement, edge: Edge): void
  {
    // Save current state before any modifications
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()

    // Save screen position for proper restoration
    const screenPosition = {
      x: rect.left,
      y: rect.top
    }

    this.dockedContainers.set(element, {
      element,
      edge,
      screenPosition,
      originalPosition: {
        top: parseFloat(style.top) || rect.top,
        left: parseFloat(style.left) || rect.left,
        width: rect.width,
        height: rect.height,
        transform: style.transform,
        position: style.position
      }
    })

    // Mark edge as occupied
    this.occupiedEdges.set(edge, element)

    // Clear any existing positioning styles that might interfere
    element.style.top = ''
    element.style.bottom = ''
    element.style.left = ''
    element.style.right = ''
    element.style.width = ''
    element.style.height = ''
    element.style.transform = ''

    // Apply docking styles based on edge with proper positioning
    element.classList.add('edge-docked', `edge-docked-${edge}`)

    // Set proper positioning for each edge to prevent shifting
    this.applyEdgePositioning(element, edge, screenPosition)

    // Set data attribute for CSS targeting
    element.setAttribute('data-docked', 'true')
    element.setAttribute('data-docked-edge', edge)
  }

  /**
   * Apply proper positioning for each edge to prevent shifting
   */
  private applyEdgePositioning(
    element: HTMLElement,
    edge: Edge,
    screenPosition: { x: number; y: number }
  ): void {
    const rect = element.getBoundingClientRect()

    switch (edge) {
      case 'top':
        // For top edge - preserve horizontal position
        element.style.left = `${screenPosition.x}px`
        element.style.width = `${rect.width}px`
        break
      case 'bottom':
        // For bottom edge - preserve horizontal position
        element.style.left = `${screenPosition.x}px`
        element.style.width = `${rect.width}px`
        break
      case 'left':
        // For left edge - preserve vertical position
        element.style.top = `${screenPosition.y}px`
        element.style.height = `${rect.height}px`
        break
      case 'right':
        // For right edge - preserve vertical position
        element.style.top = `${screenPosition.y}px`
        element.style.height = `${rect.height}px`
        break
    }
  }

  /**
   * Undock container from edge
   */
  private undockContainer(element: HTMLElement, docked: DockedContainer): void
  {
    // Remove from docked containers
    this.dockedContainers.delete(element)

    // Free the edge
    this.occupiedEdges.set(docked.edge, null)

    // Remove all docking classes and attributes
    element.classList.remove(
      'edge-docked', 'edge-docked-visible',
      'edge-docked-top', 'edge-docked-bottom',
      'edge-docked-left', 'edge-docked-right'
    )

    element.removeAttribute('data-docked')
    element.removeAttribute('data-docked-edge')

    // Clear all positioning styles
    element.style.top = ''
    element.style.bottom = ''
    element.style.left = ''
    element.style.right = ''
    element.style.width = ''
    element.style.height = ''
    element.style.transform = ''
    element.style.position = ''

    // Restore position using saved screen coordinates to avoid shifting
    this.restoreOriginalPosition(element, docked)
  }

  /**
   * Restore container to its original position without shifting
   */
  private restoreOriginalPosition(_element: HTMLElement, docked: DockedContainer): void
  {
    // Use saved screen coordinates for precise position restoration
    this.manager.setState({
      x: docked.screenPosition.x,
      y: docked.screenPosition.y,
      width: docked.originalPosition.width,
      height: docked.originalPosition.height
    })
  }

  /**
   * Get the docked container for a specific edge
   */
  getDockedContainer(edge: Edge): DockedContainer | null
  {
    const container = this.occupiedEdges.get(edge)
    return container ? this.dockedContainers.get(container) || null : null
  }

  /**
   * Check if container is docked
   */
  isContainerDocked(element: HTMLElement): boolean
  {
    return this.dockedContainers.has(element)
  }

  /**
   * Get the edge where container is docked
   */
  getContainerDockEdge(element: HTMLElement): Edge | null
  {
    const docked = this.dockedContainers.get(element)
    return docked ? docked.edge : null
  }

  /**
   * Clean up resources
   */
  destroy(): void
  {
    const container = this.manager.getContainer()
    container.removeEventListener('mouseenter', this.onMouseEnter.bind(this))
    container.removeEventListener('mouseleave', this.onMouseLeave.bind(this))

    // Undock all containers
    this.dockedContainers.forEach((docked, element) => {
      this.undockContainer(element, docked)
    })

    this.dockedContainers.clear()

    // Reset occupied edges
    this.occupiedEdges.forEach((_, edge) => {
      this.occupiedEdges.set(edge, null)
    })
  }
}
