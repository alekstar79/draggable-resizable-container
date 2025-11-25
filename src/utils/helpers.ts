// src/utuls/dom.ts
// noinspection JSUnusedGlobalSymbols

export interface CallableFn<T = any> extends Function {
  (...args: T[]): void
}

export interface StateInterface {
  zIndex(uid: string): string;
  push(uid: string): this;
  remove(uid: string): this;
  sort(uid: string): this;
}

export interface MergeContext {
  path?: string;
  parent?: Record<string, any>;
  [key: string]: any;
}

type CustomizerFunction = (
  key: string,
  targetValue: any,
  sourceValue: any,
  context: MergeContext
) => any

export class ExtendedArray<T> extends Array<T>
{
  private getAdjacentIndex(direction: 'prev' | 'next', value: T): number | undefined
  {
    const index = this.indexOf(value)
    if (index === -1) {
      return undefined
    }

    return direction === 'prev'
      ? (index - 1 + this.length) % this.length
      : (index + 1) % this.length
  }

  prev(current: T): T | undefined
  {
    const prevIndex = this.getAdjacentIndex('prev', current)

    return typeof prevIndex !== 'undefined'
      ? this[prevIndex]
      : undefined
  }

  next(current: T): T | undefined
  {
    const nextIndex = this.getAdjacentIndex('next', current)

    return typeof nextIndex !== 'undefined'
      ? this[nextIndex]
      : undefined
  }
}

export class ExtendedMap<K, V> extends Map<K, V>
{
  private getAdjacentIndex(direction: 'prev' | 'next', key: K, keys: K[]): number | undefined
  {
    const index = keys.indexOf(key)

    if (index === -1) return undefined

    return direction === 'prev'
      ? (index - 1 + keys.length) % keys.length
      : (index + 1) % keys.length
  }

  prev(key: K): V | undefined
  {
    const keys = Array.from(this.keys())
    const prevIndex = this.getAdjacentIndex('prev', key, keys)

    return typeof prevIndex !== 'undefined'
      ? this.get(keys[prevIndex])
      : undefined
  }

  next(key: K): V | undefined
  {
    const keys = Array.from(this.keys())
    const nextIndex = this.getAdjacentIndex('next', key, keys)

    return typeof nextIndex !== 'undefined'
      ? this.get(keys[nextIndex])
      : undefined
  }

  prevEntries(key: K): [K, V] | undefined
  {
    const keys = Array.from(this.keys())
    const prevIndex = this.getAdjacentIndex('prev', key, keys)
    if (typeof prevIndex === 'undefined') {
      return undefined
    }

    const prevKey = keys[prevIndex]
    const prevValue = this.get(prevKey)!

    return [prevKey, prevValue]
  }

  nextEntries(key: K): [K, V] | undefined
  {
    const keys = Array.from(this.keys())
    const nextIndex = this.getAdjacentIndex('next', key, keys)
    if (typeof nextIndex === 'undefined') {
      return undefined
    }

    const nextKey = keys[nextIndex]
    const nextValue = this.get(nextKey)!

    return [nextKey, nextValue]
  }
}

export class State implements StateInterface
{
  static inatance: StateInterface

  static highestZIndex = 1000

  static init = () => State.inatance ??= new State()

  private draggable: string[] = []

  zIndex(uid: string): string
  {
    return `${State.highestZIndex + this.draggable.findIndex(id => id === uid)}`
  }

  push(uid: string): this
  {
    this.draggable = [...new Set<string>([...this.draggable, uid])]

    return this
  }

  remove(uid: string): this
  {
    this.draggable = this.draggable.filter(id => id !== uid)

    return this
  }

  sort(uid: string): this
  {
    this.draggable.sort(($1: number | string, $2: number | string) => {
      return $1 === uid ? 1 : $2 === uid ? -1 : 0
    })

    return this
  }
}

/**
 * Deep merging of two objects with customizer support
 * @template T - Type of the resulting object
 * @param target - Target object (base)
 * @param source - Source object (data to merge)
 * @param customizer - Custom processing function
 * @param context - Merge context (used inside recursion)
 * @returns Object of type T with merged data
 */
export function deepMerge<T extends Record<string, any>>(
  target: T | null | undefined,
  source: Partial<T> | null | undefined,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): T {
  const nullishResult = handleNullishValues(target, source, customizer, context)
  if (nullishResult !== undefined) {
    return nullishResult
  }

  if (areBothArrays(target, source)) {
    return mergeArrays(target, source, customizer, context) as T
  }

  if (hasArrayMismatch(target, source)) {
    return handleArrayMismatch(target, source, customizer, context) as T
  }

  return mergePlainObjects(target as T, source as Partial<T>, customizer, context)
}

/**
 * Handle null or undefined values with customizer support
 */
function handleNullishValues<T>(
  target: T | null | undefined,
  source: Partial<T> | null | undefined,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): T | undefined {
  if (!target || typeof target !== 'object') {
    return processNullishTarget(target, source, customizer, context)
  }

  if (!source || typeof source !== 'object') {
    return processNullishSource(target, source, customizer, context)
  }

  return undefined
}

/**
 * Process when target is nullish
 */
function processNullishTarget<T>(
  target: T | null | undefined,
  source: Partial<T> | null | undefined,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): T | undefined {
  if (customizer) {
    const result = customizer('root', target, source, context)
    if (result !== undefined) {
      return result as T
    }
  }

  return (source as T) || ({} as T)
}

/**
 * Process when source is nullish
 */
function processNullishSource<T>(
  target: T,
  source: Partial<T> | null | undefined,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): T | undefined {
  if (customizer) {
    const result = customizer('root', target, source, context)
    if (result !== undefined) {
      return result as T
    }
  }

  return target
}

/**
 * Check if both values are arrays
 */
function areBothArrays(target: any, source: any): boolean
{
  return Array.isArray(target) && Array.isArray(source)
}

/**
 * Check for array/object type mismatch
 */
function hasArrayMismatch(target: any, source: any): boolean
{
  return Array.isArray(target) || Array.isArray(source)
}

/**
 * Merge two arrays with customizer support
 */
function mergeArrays<T>(
  target: any,
  source: any,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): T {
  if (customizer) {
    const customResult = customizer('array', target, source, context)
    if (customResult !== undefined) {
      return customResult as T
    }
  }

  return [...target, ...source] as unknown as T
}

/**
 * Handle array/object type mismatch
 */
function handleArrayMismatch<T>(
  target: T,
  source: T,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): T {
  if (customizer) {
    const customResult = customizer('array_mismatch', target, source, context)
    if (customResult !== undefined) {
      return customResult as T
    }
  }

  return source
}

/**
 * Merge two plain objects recursively
 */
function mergePlainObjects<T extends Record<string, any>>(
  target: T,
  source: Partial<T>,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): T {
  const output: T = { ...target } as T

  for (const key of Object.keys(source)) {
    const targetValue = target[key as keyof T]
    const sourceValue = source[key as keyof T]

    const newContext: MergeContext = {
      ...context,
      path: context.path ? `${context.path}.${key}` : key,
      parent: output
    }

    output[key as keyof T] = mergeProperty(
      key,
      targetValue,
      sourceValue,
      customizer,
      newContext
    )
  }

  return output
}

/**
 * Merge individual property with customizer support
 */
function mergeProperty(
  key: string,
  targetValue: any,
  sourceValue: any,
  customizer?: CustomizerFunction | null,
  context: MergeContext = {}
): any {
  // Apply custom merge logic if provided
  if (customizer) {
    const customResult = customizer(key, targetValue, sourceValue, context)
    if (customResult !== undefined) {
      return customResult
    }
  }

  // Recursive merge for nested objects
  if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
    return deepMerge(
      targetValue,
      sourceValue,
      customizer,
      context
    )
  }

  return sourceValue !== undefined
    ? sourceValue
    : targetValue
}

/**
 * Checks whether a value is a plain object (plain object)
 * Distinguishes objects from arrays, Date, RegExp, and other built-in types
 */
function isPlainObject(value: any): value is Record<string, any>
{
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

export type StyleValue = string | number | boolean | null

export function pick<
  T extends Record<string, any>,
  K extends keyof T
>(
  source: T,
  keys: K[],
  mix: Partial<Record<K, any>> = {}
): Pick<T, K> & typeof mix {
  return Object.assign(keys.reduce((acc, record) => ({
    ...acc, ...(record in source && { [record]: source[record] })
  }), {} as Pick<T, K>), mix)
}

export function getStyles<
  P extends string[] | Record<string, string>,
  ResultKeys extends PropertyKey = P extends string[]
    ? P[number]
    : P[keyof P]
>(
  el: Element | HTMLElement,
  props: P,
  parse: boolean = false
): Record<ResultKeys, StyleValue> {
  const computed = window.getComputedStyle(el)
  const result = {} as Record<ResultKeys, StyleValue>

  if (Array.isArray(props)) {
    for (const prop of props) {
      result[prop as ResultKeys] = parse
        ? parseStyleValue(computed.getPropertyValue(prop).trim())
        : computed.getPropertyValue(prop).trim()
    }
  } else {
    for (const originalProp in props) {
      const renamedKey = props[originalProp]
      const rawValue = computed.getPropertyValue(originalProp).trim()
      result[renamedKey as ResultKeys] = parse
        ? parseStyleValue(rawValue)
        : rawValue
    }
  }

  return result
}

function parseStyleValue(value: string): StyleValue
{
  if (!value) return null

  const lower = value.toLowerCase()

  if (lower === 'true') return true
  if (lower === 'false') return false

  const match = value.match(/^(-?[\d.]+)(px|em|rem|%|vh|vw)?$/i)
  if (match) {
    const num = parseFloat(match[1])
    if (!isNaN(num)) return num
  }

  return value
}

/**
 * Check if element is within viewport boundaries
 */
export function isInViewport(element: HTMLElement): boolean
{
  const rect = element.getBoundingClientRect()

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  )
}

/**
 * Get viewport dimensions
 */
export function getViewportDimensions(): { width: number; height: number }
{
  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight
  }
}

/**
 * Constrain value between min and max
 */
export function clamp(value: number, min: number, max: number): number
{
  return Math.min(Math.max(value, min), max)
}

/**
 * A function for tracking clicks outside the specified element.
 * @param {HTMLElement} el - Element outside which of the click will be tracked.
 * @param {(e: MouseEvent, el: HTMLElement) => void} callback - The callback function.
 */
export function clickOutside(el: HTMLElement, callback: (e: MouseEvent, el: HTMLElement) => void)
{
  const check = (e: MouseEvent, target: HTMLElement) => {
    if (el !== target && !el.contains(target)) {
      callback(e, target)
    }
  }

  document.body.addEventListener('pointerdown', e => {
    const target = e.target as HTMLElement

    if (target.shadowRoot?.children.length) {
      return check(e, e.composedPath()[0] as HTMLElement)
    }

    check(e, target)
  })
}

/**
 * @param {CallableFn} fn - Debounce function
 * @param {number} ms - timeout period
 */
export function debounce<T = any>(fn: CallableFn, ms: number = 250): CallableFn
{
  let timeout: number | null = null
  return (...args: T[]) => {
    timeout && clearTimeout(timeout)
    timeout = window.setTimeout(() => {
      fn(...args)
    }, ms)
  }
}

/**
 * @param {CallableFn} fn - Throttle function
 * @param {number} ms - wait period
 */
export function throttle<T = any>(fn: CallableFn, ms: number = 250): CallableFn
{
  let lastCall = 0
  return (...args: T[]) => {
    const now = Date.now()
    if (now - lastCall >= ms) {
      lastCall = now
      fn(...args)
    }
  }
}

/**
 * @param {Iterable} iterable - Array Like value
 * @returns {ExtendedArray}
 */
export function extendedArray<T>(iterable: Iterable<T>): ExtendedArray<T>
{
  return new ExtendedArray(...iterable)
}

/**
 * @param {Record<PropertyKey, *>} obj - object value
 * @returns {ExtendedMap<PropertyKey, *>}
 */
export function extendedMap<K extends PropertyKey, V>(
  obj: Record<K, V>
): ExtendedMap<K, V> {
  return new ExtendedMap(Object.entries(obj) as [K, V][])
}

/**
 * @param {Record<PropertyKey, *>} obj - object value
 * @returns {Map<PropertyKey, *>}
 */
export function mapFromObject<K extends PropertyKey, V>(
  obj: Record<K, V>
): Map<K, V> {
  return new Map(Object.entries(obj) as [K, V][])
}

/**
 * @returns {State} - Класс вычисляющий z-index позиции контейнеров
 */
export function getState(): StateInterface
{
  return State.init()
}
