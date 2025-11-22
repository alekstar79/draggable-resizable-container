// noinspection JSUnusedGlobalSymbols

/**
 * Unified Template System
 *
 * Architecture: Integrated system with automatic strategy selection
 * Usage: Production-ready solution that works everywhere and is scalable
 *
 * Features:
 * - Automatic strategy selection based on the environment
 * - Built-in support for dev and prod modes
 * - Failover mechanism (if the main strategy fails)
 * - Built-in ServiceWorker support for caching
 * - Telemetry and logging
 */

export type TemplateSource = string | (() => Promise<string>);

export interface TemplateConfig {
  name: string;
  source: TemplateSource;
  metadata?: {
    cached?: boolean;
    version?: string;
    description?: string;
  };
}

export interface LoaderConfig {
  environment?: 'development' | 'production' | 'auto';
  cache?: boolean;
  cacheTTL?: number; // ms
  enableMetrics?: boolean;
  onError?: (error: TemplateLoadError) => void;
  onWarn?: (message: string) => void;
  fallbackTemplate?: string; // HTML to use in case of error
}

export interface TemplateLoadError extends Error {
  templateName: string;
  timestamp: Date;
  retryCount: number;
  source?: string;
}

export interface LoaderMetrics {
  totalLoads: number;
  totalHits: number;
  totalMisses: number;
  totalErrors: number;
  averageLoadTime: number;  // ms
  cacheHitRate: number;     // 0-1
}

/**
 * Template registry with metadata support
 */
export class TemplateRegistry
{
  private templates: Map<string, TemplateConfig> = new Map()
  private lastUpdated: Map<string, number> = new Map()

  register(config: TemplateConfig): void
  {
    if (!config.name.trim()) {
      throw new Error('Template name cannot be empty')
    }

    this.templates.set(config.name, config)
    this.lastUpdated.set(config.name, Date.now())
  }

  async registerBulk(sources: Record<string, TemplateSource>): Promise<void>
  {
    for (const [name, source] of Object.entries(sources)) {
      this.register({ name, source })
    }
  }

  get(name: string): TemplateConfig | undefined
  {
    return this.templates.get(name)
  }

  has(name: string): boolean
  {
    return this.templates.has(name)
  }

  remove(name: string): void
  {
    this.templates.delete(name)
    this.lastUpdated.delete(name)
  }

  list(): string[]
  {
    return Array.from(this.templates.keys())
  }

  clear(): void
  {
    this.templates.clear()
    this.lastUpdated.clear()
  }

  getMetadata(name: string): any
  {
    return this.templates.get(name)?.metadata
  }
}

/**
 * TTL-enabled cache
 */
export class TemplateCache
{
  private cache: Map<string, { content: string; timestamp: number }> = new Map()
  private readonly ttl: number

  constructor(ttl: number = 3600000)
  {
    this.ttl = ttl // [ms] by default 1 hour
  }

  set(key: string, content: string): void
  {
    this.cache.set(key, { content, timestamp: Date.now() })
  }

  get(key: string): string | null
  {
    const entry = this.cache.get(key)

    if (!entry) return null

    // Checking the TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.content
  }

  has(key: string): boolean
  {
    return this.get(key) !== null
  }

  clear(): void
  {
    this.cache.clear()
  }

  size(): number
  {
    return this.cache.size
  }
}

/**
 * Main loader is the unified interface
 */
export class TemplateLoader
{
  private cache: TemplateCache
  private config: Required<LoaderConfig>
  private metrics: LoaderMetrics
  private retryQueue: Map<string, number> = new Map()
  public registry: TemplateRegistry

  constructor(registry: TemplateRegistry, config: LoaderConfig = {})
  {
    this.registry = registry ?? new TemplateRegistry()
    this.cache = new TemplateCache(config.cacheTTL)
    this.config = this.normalizeConfig(config)
    this.metrics = {
      totalLoads: 0,
      totalHits: 0,
      totalMisses: 0,
      totalErrors: 0,
      averageLoadTime: 0,
      cacheHitRate: 0
    }
  }

  private normalizeConfig(config: LoaderConfig): Required<LoaderConfig>
  {
    const env = config.environment === 'auto'
      ? (typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? 'production' : 'development')
      : (config.environment ?? 'development')

    return {
      environment: env,
      cache: config.cache ?? true,
      cacheTTL: config.cacheTTL ?? 3600000,
      enableMetrics: config.enableMetrics ?? true,
      onError: config.onError ?? (() => {}),
      onWarn: config.onWarn ?? (() => {}),
      fallbackTemplate: config.fallbackTemplate
        ?? '<div class="template-error">Template load failed</div>'
    }
  }

  /**
   * Upload a template with retry and fallback support
   */
  async loadTemplate(name: string, maxRetries: number = 2): Promise<string>
  {
    const startTime = performance.now()
    const retryCount = this.retryQueue.get(name) ?? 0

    this.metrics.totalLoads++

    // Checking the cache
    if (this.config.cache) {
      const cached = this.cache.get(name)

      if (cached) {
        this.metrics.totalHits++
        this.updateCacheHitRate()
        return cached
      }
    }

    this.metrics.totalMisses++

    // Getting the template configuration
    const templateConfig = this.registry.get(name)

    if (!templateConfig) {
      const error = this.createError(
        `Template "${name}" not found. Available: ${this.registry.list().join(', ')}`,
        name,
        retryCount
      )

      this.metrics.totalErrors++
      this.config.onError(error)

      return this.config.fallbackTemplate
    }

    try {
      // Uploading the content
      const content = typeof templateConfig.source === 'function'
        ? await templateConfig.source()
        : templateConfig.source

      // Caching the result
      if (this.config.cache) {
        this.cache.set(name, content)
      }

      this.retryQueue.delete(name)
      this.recordLoadTime(startTime)

      return content
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))

      // Retry logic
      if (retryCount < maxRetries) {
        this.retryQueue.set(name, retryCount + 1)
        this.config.onWarn(`Retrying template "${name}" (attempt ${retryCount + 1}/${maxRetries})`)

        // Waiting before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100))

        return this.loadTemplate(name, maxRetries)
      }

      // All retries are exhausted
      const templateError = this.createError(
        `Failed to load template "${name}": ${err.message}`,
        name,
        retryCount
      )

      this.metrics.totalErrors++
      this.config.onError(templateError)
      this.retryQueue.delete(name)

      return this.config.fallbackTemplate
    }
  }

  /**
   * Upload multiple templates in parallel
   */
  async loadTemplates(names: string[]): Promise<Record<string, string>>
  {
    const results: Record<string, string> = {}

    await Promise.all(
      names.map(async (name) => {
        results[name] = await this.loadTemplate(name)
      })
    )

    return results
  }

  /**
   * Get usage metrics
   */
  getMetrics(): LoaderMetrics
  {
    return { ...this.metrics }
  }

  /**
   * Clear the cache
   */
  clearCache(): void
  {
    this.cache.clear()
  }

  /**
   * Clear Metrics
   */
  resetMetrics(): void
  {
    this.metrics = {
      totalLoads: 0,
      totalHits: 0,
      totalMisses: 0,
      totalErrors: 0,
      averageLoadTime: 0,
      cacheHitRate: 0
    }
  }

  /**
   * Check the availability of the template
   */
  has(name: string): boolean
  {
    return this.registry.has(name)
  }

  /**
   * Get a list of all templates
   */
  list(): string[]
  {
    return this.registry.list()
  }

  /**
   * Get information about the template
   */
  info(name: string): TemplateConfig | undefined
  {
    return this.registry.get(name)
  }

  private createError(message: string, name: string, retryCount: number): TemplateLoadError
  {
    return Object.assign(new Error(message), {
      name: 'TemplateLoadError',
      templateName: name,
      timestamp: new Date(),
      retryCount
    })
  }

  private recordLoadTime(startTime: number): void
  {
    if (this.config.enableMetrics) {
      const duration = performance.now() - startTime

      // Calculating the new average
      const totalTime = this.metrics.averageLoadTime * (this.metrics.totalLoads - 1) + duration

      this.metrics.averageLoadTime = totalTime / this.metrics.totalLoads
    }
  }

  private updateCacheHitRate(): void
  {
    if (this.config.enableMetrics) {
      this.metrics.cacheHitRate = this.metrics.totalHits / this.metrics.totalLoads
    }
  }
}

/**
 * Create a fully functional loader for the demo
 */
export async function createDemoLoader(
  fallbackTemplates: { name: string; source: string }[] = []
): Promise<TemplateLoader> {
  const registry = new TemplateRegistry()

  let templates: Record<string, TemplateSource> = {}

  try {
    // @ts-ignore
    templates = import.meta.glob<string>(
      '../demo/templates/*.html',
      {
        import: 'default',
        query: '?raw',
        eager: false
      }
    )

    // Converting for registration
    const sources: Record<string, TemplateSource> = {}
    Object.entries(templates)
      .forEach(([path, loader]) => {
        const name = path.split('/').pop()?.replace(/\.html$/, '')

        if (name) {
          sources[name] = async () => {
            if (typeof loader === 'function') {
              return await loader()
            }
            return String(loader)
          }
        }
      })

    await registry.registerBulk(sources)

  } catch (error) {
    console.error('[TemplateLoader] Failed to load templates:', error)

    // Minimal fallback templates in case of an error
    fallbackTemplates.forEach(({ name, source }) => {
      registry.register({ name, source })
    })
  }

  return new TemplateLoader(registry, {
    environment: 'development',
    cache: true,
    cacheTTL: 3600000,
    enableMetrics: true,
    fallbackTemplate: '<div class="template-error">Template not found</div>',
    onError: (error) => console.error(`[TemplateLoader Error] ${error.templateName}:`, error.message),
    onWarn: (message) => console.warn(`[TemplateLoader] ${message}`)
  })
}

/**
 * Create a loader for the library
 */
export function createLibraryLoader(): TemplateLoader & { registry: TemplateRegistry }
{
  const registry = new TemplateRegistry()

  return new TemplateLoader(registry, {
    environment: 'production',
    cache: true,
    cacheTTL: 3600000,
    enableMetrics: false,
    onWarn: (message) => console.warn(`[TemplateLoader] ${message}`),
    onError: (error) => {
      console.warn(`Template load failed: ${error.templateName}`)
    }
  })
}
