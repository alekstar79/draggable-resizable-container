// src/utils/ContainerInitializer.ts

import { ContainerManagerInterface, ContainerState } from '../core/types'

/**
 * Utility for proper container initialization and state synchronization
 */
export class ContainerInitializer
{
  /**
   * Initialize container with proper DOM-manager synchronization
   */
  static async initializeContainer(
    container: HTMLElement,
    manager: ContainerManagerInterface,
    expectedState: Partial<ContainerState>
  ): Promise<void> {

    // Step 1: Set initial styles
    container.style.position = 'absolute'
    if (expectedState.width !== undefined) {
      container.style.width = `${expectedState.width}px`
    }
    if (expectedState.height !== undefined) {
      container.style.height = `${expectedState.height}px`
    }
    if (expectedState.x !== undefined) {
      container.style.left = `${expectedState.x}px`
    }
    if (expectedState.y !== undefined) {
      container.style.top = `${expectedState.y}px`
    }

    // Step 2: Force synchronous layout calculation
    await this.forceLayout(container)

    // Step 3: Get actual DOM state
    const actualRect = container.getBoundingClientRect()
    const actualState: ContainerState = {
      width: actualRect.width,
      height: actualRect.height,
      x: actualRect.left,
      y: actualRect.top
    }

    // Step 4: Initialize manager with actual DOM state
    manager.setState(actualState)

    // Step 5: Apply any constraints (like parent constraints)
    if ((manager as any).config?.constrainToParent) {
      manager.recalculateForParent()

      // Step 6: Re-synchronize after constraints
      await this.forceLayout(container)
      const finalRect = container.getBoundingClientRect()
      manager.setState({
        width: finalRect.width,
        height: finalRect.height,
        x: finalRect.left,
        y: finalRect.top
      })
    }
  }

  /**
   * Force browser to calculate layout
   */
  private static async forceLayout(element: HTMLElement): Promise<void>
  {
    // Force reflow
    const offsetHeight = element.offsetHeight
    await new Promise(resolve => requestAnimationFrame(resolve))
    void offsetHeight
  }

  /**
   * Create container element with proper initialization
   */
  static createContainerElement(
    width: number,
    height: number,
    x?: number,
    y?: number,
    color?: string
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'container advanced-container new'

    container.style.position = 'absolute'
    container.style.width = `${width}px`
    container.style.height = `${height}px`

    if (x !== undefined) container.style.left = `${x}px`
    if (y !== undefined) container.style.top = `${y}px`
    if (color) container.style.borderColor = color

    return container
  }
}
