/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_TOKEN: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENVIRONMENT?: string
  readonly VITE_ENABLE_ANALYTICS?: string
  readonly VITE_FOOTY_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
