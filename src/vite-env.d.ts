/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly glob: import('vite/types/importGlob').ImportGlobFunction
}
