/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Databuddy client id; set only on the production deploy. Empty or missing keeps analytics off. */
  readonly VITE_DATABUDDY_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
