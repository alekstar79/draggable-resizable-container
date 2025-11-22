// src/utils/statsManager.ts
// noinspection JSUnusedGlobalSymbols

import type { ContainerManagerWithSnapping } from '../plugins'
import type { DirectionMode } from '../core/types'

/**
 * Interface for container statistics
 */
export interface ContainerStats {
  activeBlock: string
  lock: 'opened' | 'locked'
  direction: DirectionMode
  step?: number
  hasSnapping: boolean
}

/**
 * Interface for global statistics
 */
export interface GlobalStats {
  containerCount: number
  contentTypes: string
  pinnedMode: string
  snappingCount: number
}

/**
 * Statistics manager for handling both global and per-container stats
 */
export class StatsManager
{
  private globalStatsElement: HTMLElement | null = null
  private isShowingContainerStats: boolean = false

  /**
   * Initialize stats manager
   */
  initialize(globalStatsElement: HTMLElement): void
  {
    this.globalStatsElement = globalStatsElement
  }

  /**
   * Show container-specific statistics
   */
  showContainerStats(containerStats: ContainerStats): void
  {
    if (!this.globalStatsElement) return

    this.isShowingContainerStats = true

    this.updateStatsPanel(this.generateContainerStatsHTML(containerStats))
  }

  /**
   * Show global statistics
   */
  showGlobalStats(globalStats: GlobalStats): void
  {
    if (!this.globalStatsElement) return

    this.isShowingContainerStats = false

    this.updateStatsPanel(this.generateGlobalStatsHTML(globalStats))
  }

  /**
   * Check if currently showing container stats
   */
  isDisplayingContainerStats(): boolean
  {
    return this.isShowingContainerStats
  }

  /**
   * Generate HTML for container statistics
   */
  private generateContainerStatsHTML(stats: ContainerStats): string
  {
    const stepDisplay = stats.hasSnapping && stats.step !== undefined
      ? `<div class="stat-item">
           <span class="stat-label">Step:</span>
           <span class="stat-value">${stats.step}</span>
         </div>`
      : ''

    return `
      <h4>Block Stats</h4>
      <div class="stat-item">
        <span class="stat-label">Active Block:</span>
        <span class="stat-value">${stats.activeBlock}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Lock:</span>
        <span class="stat-value">${stats.lock}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Direction:</span>
        <span class="stat-value">${stats.direction}</span>
      </div>
      ${stepDisplay}`
  }

  /**
   * Generate HTML for global statistics
   */
  private generateGlobalStatsHTML(stats: GlobalStats): string
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

  /**
   * Update stats panel with new HTML content
   */
  private updateStatsPanel(html: string): void
  {
    if (this.globalStatsElement) {
      this.globalStatsElement.innerHTML = html
    }
  }

  /**
   * Get container statistics from manager
   */
  static getContainerStats(manager: ContainerManagerWithSnapping, containerId: string): ContainerStats
  {
    const mode = manager.getMode()
    const direction = manager.getDirection()
    const snappingConfig = manager.getSnappingConfig?.()

    const title = manager.getContainer().dataset.title || containerId

    return {
      activeBlock: title,
      lock: mode === 'pinned' ? 'locked' : 'opened',
      direction: direction,
      step: snappingConfig?.snapStep,
      hasSnapping: snappingConfig?.enabled || false
    }
  }

  /**
   * Get global statistics from containers array
   */
  static getGlobalStats(containers: any[]): GlobalStats
  {
    const isGlobalPinned = containers.some(({ manager }) => manager.getMode() === 'pinned')
    const typeCount: Record<string, number> = { string: 0, template: 0, element: 0 }
    containers.forEach(({ type }) => {
      typeCount[type]++
    })

    return {
      containerCount: containers.length,
      contentTypes: `S:${typeCount.string} T:${typeCount.template} E:${typeCount.element}`,
      pinnedMode: isGlobalPinned ? 'Enabled' : 'Disabled',
      snappingCount: containers.filter(c => c.hasSnapping).length
    }
  }
}
