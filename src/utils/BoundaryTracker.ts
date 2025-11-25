/**
 * BoundaryTracker.ts
 * Tracks the approach of the dragged element to the edges of the viewport
 * The element remains inside the viewport, and the detection zones are also inside
 */

export type Event = 'edge:enter' | 'edge:leave' | 'cursor:enter' | 'cursor:leave'
export type Edge = 'top' | 'right' | 'bottom' | 'left'

export interface Options {
  emitter?: EventEmitter | boolean,
  edgeThreshold?: number,
}

export interface EdgeZoneInfo {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
  edge: Edge | null
}

export interface SourceEdgeInfo extends EdgeZoneInfo {
  source: 'element' | 'cursor'
  element: HTMLElement | null
}

export interface IBoundaryTracker {
  start(): void
  stop(): void
  addTarget(element: HTMLElement): void
  removeTarget(element: HTMLElement): void
  onChange(callback: EdgeChangeCallback): () => void
  getCursorEdgeInfo(): EdgeZoneInfo
  setEdgeThreshold(threshold: number): void
  destroy(): void
}

export interface IEdgeController extends IBoundaryTracker{
  getCurrentEdge(): Partial<SourceEdgeInfo>
  on(event: Event, callback: EdgeChangeCallback): void
  onCursorEnter(data: SourceEdgeInfo): void
  onCursorLeave(data: SourceEdgeInfo): void
  onEdgeEnter(data: SourceEdgeInfo): void
  onEdgeLeave(data: SourceEdgeInfo): void
  setEmitter(emitter: EventEmitter): void
}

export type EdgeChangeCallback = (data: Partial<SourceEdgeInfo>) => void
export type EventCallback<T = any> = (data?: T) => void
export type EventMap = Record<string, any>

function reducer(acc: Partial<SourceEdgeInfo>, [k, v]: [string, any]): Partial<SourceEdgeInfo>
{
  return v ? { ...acc, [k]: v } : acc
}

export class EdgeInfo implements SourceEdgeInfo
{
  public source: 'element' | 'cursor' = 'cursor'
  public element: HTMLElement | null = null
  public top: boolean = false
  public right: boolean = false
  public bottom: boolean = false
  public left: boolean = false
  public edge: Edge | null = null

  constructor(info: SourceEdgeInfo)
  {
    Object.assign(this, info)
  }
}

export class EventEmitter<T extends EventMap = any>
{
  private listeners: Partial<{ [K in keyof T]: Set<EventCallback<T[K]>> }> = {}

  on<K extends keyof T>(event: K, callback: EventCallback<T[K]>): () => void
  {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set()
    }

    this.listeners[event].add(callback)

    return () => {
      this.off?.(event, callback)
    }
  }

  emit<K extends keyof T>(event: K, data?: T[K]): void
  {
    this.listeners[event]?.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in event listener for ${String(event)}:`, error)
      }
    })
  }

  off?<K extends keyof T>(event: K, callback: EventCallback<T[K]>): void
  {
    this.listeners[event]?.delete(callback)
  }

  destroy?(): void
  {
    this.listeners = {}
  }
}

/**
 * The main class for tracking borders
 * Uses requestAnimationFrame for accurate tracking during drag
 */
export class InternalBoundaryTracker implements IBoundaryTracker
{
  private readonly root: HTMLElement | null
  private edgeThreshold: number
  private targets: Set<HTMLElement> = new Set()
  private currentEdges: Map<HTMLElement, EdgeZoneInfo> = new Map()
  private rafId: number | null = null
  private isActive: boolean = false
  private callbacks: Set<EdgeChangeCallback> = new Set()
  private currentMousePos: { x: number; y: number } = { x: 0, y: 0 }
  private currentCursorEdge: EdgeZoneInfo = {
    top: false,
    right: false,
    bottom: false,
    left: false,
    edge: null
  }

  constructor(
    edgeThreshold: number = 50,
    targets?: HTMLElement[] | Set<HTMLElement>,
    root: HTMLElement | null = null
  ) {
    this.edgeThreshold = edgeThreshold
    this.targets = targets instanceof Set ? targets : new Set(targets)
    this.root = root

    if (targets) {
      targets.forEach(t => this.targets.add(t))
    }

    this.checkBoundaries = this.checkBoundaries.bind(this)
  }

  /**
   * Start tracking the approach to the edges
   */
  public start(): void
  {
    if (this.isActive) return

    this.isActive = true
    this.setupMouseTracking()
    this.checkBoundaries()
  }

  /**
   * Stop tracking
   */
  public stop(): void
  {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    this.isActive = false
  }

  public addTarget(element: HTMLElement): void
  {
    this.targets.add(element)
  }

  public removeTarget(element: HTMLElement): void
  {
    this.targets.delete(element)
    this.currentEdges.delete(element)
  }

  /**
   * Subscribe to boundary changes
   */
  public onChange(callback: EdgeChangeCallback): () => void
  {
    this.callbacks.add(callback)

    return () => {
      this.callbacks.delete(callback)
    }
  }

  /**
   * Get current information about cursor boundaries
   */
  public getCursorEdgeInfo(): EdgeZoneInfo
  {
    return { ...this.currentCursorEdge }
  }

  /**
   * Update threshold (distance to edge)
   */
  public setEdgeThreshold(threshold: number): void
  {
    if (threshold < 0) {
      throw new Error('Edge threshold must be non-negative')
    }

    this.edgeThreshold = threshold
  }

  /**
   * Set up Mouse Tracking
   */
  private setupMouseTracking(): void
  {
    document.addEventListener('mousemove', (e: MouseEvent) => {
      this.currentMousePos = { x: e.clientX, y: e.clientY }
    })
  }

  private getViewportSize(): { width: number; height: number }
  {
    return this.root
      ? { width: this.root.clientWidth, height: this.root.clientHeight }
      : { width: window.innerWidth, height: window.innerHeight }
  }

  private getRelativeRect(target: HTMLElement): DOMRect
  {
    const targetRect = target.getBoundingClientRect()
    if (!this.root) return targetRect

    const rootRect = this.root.getBoundingClientRect()

    return {
      x: targetRect.left - rootRect.left,
      y: targetRect.top - rootRect.top,
      top: targetRect.top - rootRect.top,
      bottom: targetRect.bottom - rootRect.top,
      left: targetRect.left - rootRect.left,
      right: targetRect.right - rootRect.left,
      height: targetRect.height,
      width: targetRect.width,
      toJSON: () => {}
    }
  }

  private getCursorPosition(): { x: number; y: number }
  {
    if (!this.root) return this.currentMousePos

    const rootRect = this.root.getBoundingClientRect()

    return {
      x: this.currentMousePos.x - rootRect.left,
      y: this.currentMousePos.y - rootRect.top
    }
  }

  /**
   * Check the proximity to the borders (element and cursor)
   */
  private checkBoundaries(): void
  {
    // Checking elements
    this.targets.forEach((target: HTMLElement) => {
      const elementInfo = this.checkElementBoundaries(target)
      const prevEdge = this.currentEdges.get(target)

      if (!prevEdge || this.hasEdgeChanged(prevEdge, elementInfo)) {
        this.currentEdges.set(target, elementInfo)
        this.notifyCallbacks(new EdgeInfo({ ...elementInfo, source: 'element', element: target }))
      }
    })

    // Checking cursor
    const cursorInfo = this.checkCursorBoundaries()
    if (this.hasEdgeChanged(this.currentCursorEdge, cursorInfo)) {
      this.currentCursorEdge = cursorInfo
      this.notifyCallbacks(new EdgeInfo({ ...cursorInfo, source: 'cursor', element: null }))
    }

    if (this.isActive) {
      this.rafId = requestAnimationFrame(
        this.checkBoundaries
      )
    }
  }

  /**
   * Emulating Bounding Rect for cursor
   */
  private getCursorBoundingClientRect(): DOMRect
  {
    const { x, y } = this.getCursorPosition()

    return {
      x, y,
      top: y, bottom: y, left: x, right: x,
      width: 0, height: 0,
      toJSON: () => {}
    }
  }

  /**
   * Check the boundaries of an element
   */
  private checkElementBoundaries(target: HTMLElement): EdgeZoneInfo
  {
    const { width: vw, height: vh } = this.getViewportSize()
    const rect = this.getRelativeRect(target)

    const edge: EdgeZoneInfo = {
      top: rect.top < this.edgeThreshold,
      right: rect.right > vw - this.edgeThreshold,
      bottom: rect.bottom > vh - this.edgeThreshold,
      left: rect.left < this.edgeThreshold,
      edge: null,
    }

    this.determineEdge(edge, rect, vw, vh)

    return edge
  }

  /**
   * Check the boundaries of a cursor
   */
  private checkCursorBoundaries(): EdgeZoneInfo
  {
    const rect = this.getCursorBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const cursorEdge: EdgeZoneInfo = {
      top: rect.top < this.edgeThreshold,
      right: rect.right > vw - this.edgeThreshold,
      bottom: rect.bottom > vh - this.edgeThreshold,
      left: rect.left < this.edgeThreshold,
      edge: null
    }

    this.determineEdge(cursorEdge, rect, vw, vh)

    return cursorEdge
  }

  /**
   * Check if the state has changed
   */
  private hasEdgeChanged(oldEdge: EdgeZoneInfo, newEdge: EdgeZoneInfo): boolean
  {
    return (
      oldEdge.top !== newEdge.top ||
      oldEdge.right !== newEdge.right ||
      oldEdge.bottom !== newEdge.bottom ||
      oldEdge.left !== newEdge.left
    )
  }

  /**
   * Determine a priority edge-side (or several)
   */
  private determineEdge(
    edge: EdgeZoneInfo,
    rect: DOMRect,
    vw: number,
    vh: number
  ): void {
    const edges: Edge[] = []

    if (edge.top) edges.push('top')
    if (edge.right) edges.push('right')
    if (edge.bottom) edges.push('bottom')
    if (edge.left) edges.push('left')

    if (edges.length === 0) {
      edge.edge = null
    } else if (edges.length === 1) {
      edge.edge = edges[0]
    } else {
      const distances = {
        top: rect.top,
        right: vw - rect.right,
        bottom: vh - rect.bottom,
        left: rect.left
      }

      // In the corner, the nearest edge is selected
      edge.edge = edges.reduce((prev, curr) =>
        distances[curr] < distances[prev] ? curr : prev
      ) as Edge
    }
  }

  /**
   * Notify all subscribers of the change
   */
  private notifyCallbacks(edge: SourceEdgeInfo): void
  {
    this.callbacks.forEach(callback => {
      try {
        callback(edge)
      } catch (error) {
        console.error('Error in boundary change callback:', error)
      }
    })
  }

  /**
   * Clear resources
   */
  public destroy(): void
  {
    this.stop()
    this.callbacks.clear()
  }
}

export class EdgeController extends InternalBoundaryTracker implements IEdgeController
{
  private static instance: IEdgeController

  public static init(edgeThreshold?: number, elements?: HTMLElement[])
  {
    return EdgeController.instance ??= new EdgeController(edgeThreshold, elements)
  }

  private lastEdge: Partial<SourceEdgeInfo> = {}
  public emitter: EventEmitter | null = null

  constructor(edgeThreshold?: number, elements?: HTMLElement[])
  {
    super(edgeThreshold, elements)

    this.onChange(this.onBoundaryChange.bind(this))
    this.start()
  }

  private changed({ edge, source, element }: Partial<SourceEdgeInfo>): boolean
  {
    return edge !== this.lastEdge.edge || source !== this.lastEdge.source || element !== this.lastEdge.element
  }

  private onBoundaryChange({ edge, source, element }: Partial<SourceEdgeInfo>): void
  {
    if (!this.changed({ edge, source, element })) return

    this.lastEdge = Object.entries({ edge, source, element }).reduce(reducer, {})

    if (!element) {
      edge
        ? this.onCursorEnter({ edge, source })
        : this.onCursorLeave(this.lastEdge)
    } else {
      edge
        ? this.onEdgeEnter({ edge, source, element })
        : this.onEdgeLeave(this.lastEdge)
    }
  }

  public onEdgeEnter(data: Partial<SourceEdgeInfo>): void
  {
    this.emitter?.emit('edge:enter', data)
  }

  public onEdgeLeave(data: Partial<SourceEdgeInfo>): void
  {
    this.emitter?.emit('edge:leave', data)
  }

  public onCursorEnter(data: Partial<SourceEdgeInfo>): void
  {
    this.emitter?.emit('cursor:enter', data)
  }

  public onCursorLeave(data: Partial<SourceEdgeInfo>): void
  {
    this.emitter?.emit('cursor:leave', data)
  }

  setEmitter(emitter: EventEmitter): void
  {
    this.emitter = emitter
  }

  on(event: Event, callback: EdgeChangeCallback): void
  {
    this.emitter?.on(event, callback)
  }

  getCurrentEdge(): Partial<SourceEdgeInfo>
  {
    return this.lastEdge
  }
}

export function createTracker(
  options = {} as Options,
  elements: HTMLElement[] = []
): IEdgeController {
  const controller = EdgeController.init(options.edgeThreshold, elements)

  if (options.emitter) {
    controller.setEmitter(
      options.emitter instanceof EventEmitter ? options.emitter : new EventEmitter()
    )
  }

  return controller
}
