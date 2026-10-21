/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PATCHY_URL?: string;
  readonly VITE_ENABLE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
