# Draggable Resizable Container

A modern TypeScript library for managing draggable and resizable containers with plugin system support.

<!-- TOC -->
* [Draggable Resizable Container](#draggable-resizable-container)
  * [Features](#features)
  * [Installation](#installation)
  * [Quick Start](#quick-start)
  * [Plugins](#plugins)
    * [Available Plugins](#available-plugins)
    * [Using Plugins](#using-plugins)
  * [Configuration](#configuration)
  * [Development](#development)
  * [Browser Support](#browser-support)
  * [License](#license)
<!-- TOC -->

## Features

- 🎯 Draggable containers with smooth movement
- 📏 Resizable containers with multiple handle directions
- 🔌 Extensible plugin system
- 🎨 Reactive state management
- 📱 Touch device support
- 🎛️ Multiple movement modes (smooth, pinned, snap)
- 🧩 Template loading system
- 💾 State persistence
- 🧪 Comprehensive demo application

## Installation

```bash
npm install @alekstar79/container-manager
```
## Quick Start

```typescript
import { ContainerManager } from '@alekstar79/container-manager'
import { SnappingPlugin } from '@alekstar79/container-manager/plugins'

// Create a container element
const container = document.createElement('div')
container.className = 'container'
document.body.appendChild(container)

// Initialize container manager
const manager = new ContainerManager(container, {
  mode: 'smooth',
  boundaries: { minWidth: 200, minHeight: 150 },
  resize: { enabled: true, directions: ['se'] }
})

// Add plugins
manager.use(new SnappingPlugin({ snapStep: 30 }))
```

## Plugins

### Available Plugins

- SnappingPlugin: Grid-based movement snapping
- EdgeDockingPlugin: Dock containers to screen edges (experimental)
- StatePersistencePlugin: Save/restore container states
- LoggingPlugin: Debug and monitoring

### Using Plugins

```typescript
import { SnappingPlugin, StatePersistencePlugin } from '@alekstar79/container-manager/plugins'

manager
.use(new SnappingPlugin({ snapStep: 20 }))
.use(new StatePersistencePlugin(), { containerId: 'my-container' })
```

## Configuration

```typescript
interface ContainerConfig {
  mode: 'smooth' | 'pinned' | 'snap'
  boundaries: {
    minWidth?: number
    minHeight?: number  
    maxWidth?: number
    maxHeight?: number
  }
  resize: {
    enabled: boolean
    directions: ResizeDirection[]
  }
  constrainToViewport: boolean
  constrainToParent?: boolean
  autoAdjust?: AutoAdjustConfig
}
```
## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build library
npm run build:lib

# Build demo
npm run build

# Type checking
npm run type-check
```

## Browser Support

- Chrome 88+
- Firefox 78+
- Safari 14+
- Edge 88+

## License

MIT © 2025 @alekstar79
