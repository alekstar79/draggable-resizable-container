// noinspection JSUnusedGlobalSymbols

/**
 * Demo Container Factory for creating demo container content and configurations
 * Provides consistent content creation for both initial creation and restoration
 */

/**
 * Demo container configuration interface
 */
export interface DemoContainerConfig {
  type: 'string' | 'template' | 'element'
  title: string
  color: string
  template?: string
  useSnapping?: boolean
  description?: string
  boundaries?: {}
}

/**
 * Demo container content factory
 */
export class DemoContainerFactory
{
  private configs: Record<string, DemoContainerConfig> = {
    'demo-string-container': {
      type: 'string',
      title: 'String Content',
      color: '#3b82f6',
      useSnapping: false,
      description: 'String content demo container'
    },
    'demo-template-container': {
      type: 'template',
      title: 'Template Content',
      color: '#10b981',
      template: 'media',
      useSnapping: false,
      description: 'Template content demo container'
    },
    'demo-element-container': {
      type: 'element',
      title: 'DOM Element',
      color: '#f59e0b',
      useSnapping: true,
      description: 'DOM element content demo container'
    },
    'demo-snapping-container': {
      type: 'string',
      title: 'Snapping Demo',
      color: '#8b5cf6',
      useSnapping: true,
      description: 'Snapping plugin demo container'
    },
    'demo-parent-constrained-container': {
      type: 'string',
      title: 'Parent Constrained',
      color: '#4299e1',
      useSnapping: false,
      description: 'Parent-constrained container demo'
    },
    'demo-custom-boundaries-container': {
      type: 'string',
      title: 'Custom Boundaries',
      color: '#10b981',
      useSnapping: false,
      description: 'Custom boundaries container demo'
    }
  }

  /**
   * Get demo container configuration by container ID
   */
  getDemoConfig(containerId: string): DemoContainerConfig | null
  {
    return this.configs[containerId] || null
  }

  /**
   * Check if container ID belongs to a demo container
   */
  isDemoContainer(containerId: string): boolean
  {
    return this.getDemoConfig(containerId) !== null
  }

  /**
   * Create content for demo container based on its configuration
   */
  async createDemoContent(_containerId: string, config: DemoContainerConfig): Promise<string | HTMLElement | { template: string }>
  {
    switch (config.type) {
      case 'string':
        return this.createStringContent(config)
      case 'template':
        return this.createTemplateContent(config)
      case 'element':
        return this.createElementContent(config)

      default:
        throw new Error(`Unknown demo container type: ${config.type}`)
    }
  }

  /**
   * Create string content for demo container
   */
  private createStringContent(config: DemoContainerConfig): string
  {
    if (config.title === 'Snapping Demo') {
      return `
        <div class="content-section">
          <h4>${config.title}</h4>
          <p>This container uses the <strong>SnappingPlugin</strong> for grid-based movement.</p>
          <div class="feature-list">
            <div class="feature-item">✅ Grid snapping</div>
            <div class="feature-item">✅ Configurable step size</div>
            <div class="feature-item">✅ Direction modes</div>
            <div class="feature-item">✅ Dynamic control</div>
          </div>
          <div class="snapping-controls-info">
            <p><small>Use the snap step and mode controls in the main panel to configure snapping behavior.</small></p>
          </div>
        </div>`
    }

    if (config.title === 'Custom Boundaries') {
      return `
        <div class="content-section">
          <h4>${config.title}</h4>
          <p>This container has custom size boundaries: min 200x150, max 500x400</p>
          <div class="feature-list">
            <div class="feature-item">✅ Min width: 200px</div>
            <div class="feature-item">✅ Min height: 150px</div>
            <div class="feature-item">✅ Max width: 500px</div>
            <div class="feature-item">✅ Max height: 400px</div>
          </div>
        </div>`
    }

    if (config.title === 'Parent Constrained') {
      return `
        <div class="content-section">
          <h4>${config.title}</h4>
          <p>This container is constrained to its parent element.</p>
          <div class="feature-list">
            <div class="feature-item">✅ Parent-constrained boundaries</div>
            <div class="feature-item">✅ Auto-adjust width/height</div>
            <div class="feature-item">✅ Multi-direction resize</div>
          </div>
        </div>`
    }

    return `
      <div class="content-section">
        <h4>${config.title}</h4>
        <p>This content is defined as a <strong>string</strong> in the JavaScript code.</p>
        <div class="feature-list">
          <div class="feature-item">✅ Easy to implement</div>
          <div class="feature-item">✅ Simple content</div>
          <div class="feature-item">✅ No external files</div>
          <div class="feature-item">${config.useSnapping ? '✅ With Snapping' : '❌ No Snapping'}</div>
        </div>
        <div class="content-info">
          <small>Content type: <strong>String</strong></small>
        </div>
      </div>`
  }

  /**
   * Create template content for demo container
   */
  private createTemplateContent(config: DemoContainerConfig): { template: string }
  {
    if (!config.template) {
      throw new Error('Template name is required for template content')
    }

    return { template: config.template }
  }

  /**
   * Create DOM element content for demo container
   */
  private createElementContent(config: DemoContainerConfig): HTMLElement
  {
    // Create DOM element programmatically
    const contentElement = document.createElement('div')
    contentElement.className = 'custom-element-content'
    contentElement.innerHTML = `
      <h4>${config.title}</h4>
      <p>This content is created as a <strong>DOM Element</strong> programmatically.</p>
      <div class="interactive-demo">
        <button class="btn btn-warning demo-btn" id="colorChange">Change Color</button>
        <button class="btn btn-success demo-btn" id="addItem">Add Item</button>
        <div class="item-list" id="itemList"></div>
      </div>
      <div class="snapping-info">
        <small>Snapping: <strong>${config.useSnapping ? 'Enabled' : 'Disabled'}</strong></small>
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
      item.textContent = `Item ${itemCount}`
      item.style.animation = 'slideIn 0.3s ease-out'
      itemList.appendChild(item)
    })

    return contentElement
  }

  /**
   * Add template info bar to container content
   */
  addTemplateInfo(container: HTMLElement, templateName: string, useSnapping: boolean): void
  {
    const infoElement = document.createElement('div')
    infoElement.className = 'template-info-bar'
    infoElement.innerHTML = `Template: <strong>${templateName}.html</strong> • ${useSnapping ? 'With Snapping' : 'No Snapping'}`

    const contentElement = container.querySelector('.container-content')
    if (contentElement) {
      contentElement.appendChild(infoElement)
    }
  }

  /**
   * Get all demo container IDs
   */
  getAllDemoContainerIds(): string[]
  {
    return [
      'demo-string-container',
      'demo-template-container',
      'demo-element-container',
      'demo-snapping-container',
      'demo-parent-constrained-container',
      'demo-custom-boundaries-container'
    ]
  }
}
