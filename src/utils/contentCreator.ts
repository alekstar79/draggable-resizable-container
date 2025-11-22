// noinspection JSUnusedGlobalSymbols

import { TemplateLoader } from './index'

/**
 * Content creator utility for flexible content handling
 * Supports strings, DOM elements, and template loading
 */
export class ContentCreator
{
  private templateLoader: TemplateLoader

  constructor(templateLoader: TemplateLoader)
  {
    this.templateLoader = templateLoader
  }

  /**
   * Create content from various sources
   * @param content - String, HTMLElement, or template name
   * @param container - Container element to append content to
   */
  async createContent(
    content: string | HTMLElement | { template: string },
    container: HTMLElement
  ): Promise<HTMLElement> {
    try {
      // Checking if the container is already container-content
      const isAlreadyContentContainer = container.classList.contains('container-content')

      // Find or create a target element for your content
      let targetElement: HTMLElement

      if (isAlreadyContentContainer) {
        // If the container is already a container-content, use it directly
        targetElement = container
      } else {
        // Searching for existing container-content inside a container
        targetElement = container.querySelector('.container-content') as HTMLElement

        if (!targetElement) {
          targetElement = document.createElement('div')
          targetElement.className = 'container-content'
          container.appendChild(targetElement)
        }
      }

      targetElement.innerHTML = ''

      if (typeof content === 'string') {
        // String content
        targetElement.innerHTML = content
      } else if (content instanceof HTMLElement) {
        // DOM element
        targetElement.appendChild(content)
      } else if (content.template) {
        // Template content
        try {
          targetElement.innerHTML = await this.templateLoader.loadTemplate(content.template)
        } catch (error) {
          console.error(`[ContentCreator] Failed to load template: ${content.template}`, error)
          targetElement.innerHTML = `<div class="template-error">Failed to load template: ${content.template}</div>`
        }
      }

      return targetElement
    } catch (error) {
      console.error('[ContentCreator] Error creating content:', error)
      throw error
    }
  }

  /**
   * Set template loader instance
   */
  setTemplateLoader(loader: TemplateLoader): void
  {
    this.templateLoader = loader
  }
}
