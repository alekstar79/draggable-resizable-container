// src/plugins/LoggingPlugin.ts

import { ContainerManagerInterface, Plugin, ContainerEvent } from '../core/types'
import { debounce } from '../utils'

/**
 * Logging plugin for Container Manager
 * Logs container events and displays notifications
 */
export class LoggingPlugin implements Plugin
{
  private static _pluginId: Symbol = Symbol('LoggingPlugin')

  get pluginId(): Symbol {
    return LoggingPlugin._pluginId
  }

  private manager?: ContainerManagerInterface
  private containerName: string = ''
  private notificationSystem: any = null

  /**
   * Install plugin on container manager instance
   */
  install(manager: ContainerManagerInterface, options?: any): void
  {
    this.manager = manager
    this.containerName = options?.containerName || `Container-${Math.random().toString(36).substring(2, 11)}`
    this.notificationSystem = options?.notificationSystem
    this.bindEvents()
  }

  /**
   * Bind to container events
   */
  private bindEvents(): void
  {
    if (!this.manager) return

    this.logResize = debounce(this.logResize.bind(this))
    this.logDrag = debounce(this.logDrag.bind(this))
    this.logViewportResize = debounce(this.logViewportResize.bind(this))
    this.logSnapStep = debounce(this.logSnapStep.bind(this))

    // Mode change events
    this.manager.on('modeChange', (event: ContainerEvent) => {
      this.logModeChange(event.mode)
    })

    // Resize events with debounce
    this.manager.on('resize', (event: ContainerEvent) => {
      this.logResize(event.state)
    })

    this.manager.on('resizeEnd', (event: ContainerEvent) => {
      this.logResize(event.state)
    })

    // Drag events with debounce
    this.manager.on('drag', (event: ContainerEvent) => {
      this.logDrag(event.state)
    })

    this.manager.on('dragEnd', (event: ContainerEvent) => {
      this.logDrag(event.state)
    })

    // Viewport resize events
    this.manager.on('viewportResize', (event: ContainerEvent) => {
      this.logViewportResize(event.state)
    })

    // Plugin events for snapping
    this.manager.onPluginEvent('snappingEnabledChanged', (data: any) => {
      this.logSnappingEnabled(data.enabled)
    })

    this.manager.onPluginEvent('snapStepChanged', (data: any) => {
      this.logSnapStep(data.snapStep)
    })

    // Direction change events
    this.manager.onPluginEvent('directionChanged', (data: any) => {
      this.logDirectionChange(data.direction)
    })
  }

  /**
   * Log resize event
   */
  private logResize(state: any): void
  {
    const message = `Resized to ${Math.round(state.width)}×${Math.round(state.height)}`
    this.showNotification(message, 'info')
  }

  /**
   * Log drag event
   */
  private logDrag(state: any): void
  {
    const message = `Moved to (${Math.round(state.x)}, ${Math.round(state.y)})`
    this.showNotification(message, 'info')
  }

  /**
   * Log mode change event
   */
  private logModeChange(mode: string): void
  {
    const message = `Mode changed to ${mode}`
    this.showNotification(message, 'warning')
  }

  /**
   * Log viewport resize adjustment event
   */
  private logViewportResize(state: any): void
  {
    const message = `Adjusted position to (${Math.round(state.x)}, ${Math.round(state.y)}) due to window resize`
    this.showNotification(message, 'info')
  }

  /**
   * Log snapping enabled/disabled
   */
  private logSnappingEnabled(enabled: boolean): void
  {
    const message = `Snapping ${enabled ? 'enabled' : 'disabled'}`
    this.showNotification(message, enabled ? 'success' : 'warning')
  }

  /**
   * Log snap step change
   */
  private logSnapStep(step: number): void
  {
    const message = `Snap step changed to ${step}px`
    this.showNotification(message, 'info')
  }

  /**
   * Log direction change
   */
  private logDirectionChange(direction: string): void
  {
    const message = `Drag direction: ${direction}`
    this.showNotification(message, 'info')
  }

  /**
   * Show notification using notification system
   */
  private showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info'): void
  {
    if (this.notificationSystem) {
      const fullMessage = `${this.containerName}: ${message}`
      this.notificationSystem.show(fullMessage, type)
    }
  }
}
