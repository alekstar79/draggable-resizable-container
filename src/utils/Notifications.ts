// src/utils/notifications.ts
// noinspection JSUnusedGlobalSymbols

/**
 * Notification system for displaying toast messages
 * Adapted for TypeScript with improved functionality
 */
export class NotificationSystem
{
  private container: HTMLElement

  constructor(container?: HTMLElement)
  {
    this.container = container || this.createContainer()
  }

  /**
   * Create notifications container
   */
  private createContainer(): HTMLElement
  {
    const existingContainer = document.querySelector('.notifications') as HTMLElement
    if (existingContainer) {
      return existingContainer
    }

    const container = document.createElement('div')
    container.className = 'notifications'
    document.body.appendChild(container)
    return container
  }

  /**
   * Show notification toast
   */
  show(text: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void
  {
    const toast = document.createElement('li')
    const remove = this.removeToast.bind(this, toast)

    toast.innerHTML = this.getToastHTML(text, type)
    toast.className = `toast ${type}`;

    (toast as any).timeoutId = window.setTimeout(remove, 4000)

    const closeIcon = toast.querySelector('.icon')
    if (closeIcon) {
      closeIcon.addEventListener('click', remove)
    }

    // Add new toast to the bottom of the container
    this.container.appendChild(toast)
  }

  /**
   * Generate toast HTML based on type
   */
  private getToastHTML(text: string, type: 'success' | 'error' | 'warning' | 'info'): string
  {
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    }

    return `
      <div class="column">
        <i class="fa-solid ${icons[type]}"></i>
        <span>${text}</span>
      </div>
      <i class="icon fa-solid fa-xmark"></i>
    `
  }

  /**
   * Remove toast with animation
   */
  private removeToast(toast: HTMLLIElement): void
  {
    toast.classList.add('hide')

    // Use any for timeoutId property
    if ((toast as any).timeoutId) {
      clearTimeout((toast as any).timeoutId)
    }

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300)
  }

  /**
   * Clear all notifications
   */
  clear(): void
  {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild)
    }
  }
}

// Default instance for convenience
export const defaultNotificationSystem = new NotificationSystem()
