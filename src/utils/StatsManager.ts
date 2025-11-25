// src/utils/statsManager.ts

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

    this.updateStatsPanel(this.generateContainerStatsHTML(containerStats))
  }

  /**
   * Show global statistics
   */
  showGlobalStats(globalStats: GlobalStats): void
  {
    if (!this.globalStatsElement) return

    this.updateStatsPanel(this.generateGlobalStatsHTML(globalStats))
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
}
