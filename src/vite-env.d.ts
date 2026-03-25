/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AWS_LOCATION_API_KEY?: string;
  readonly VITE_AWS_LOCATION_REGION?: string;
  readonly VITE_MAPY_API_KEY?: string;
  readonly VITE_MAPY_API_BASE_URL?: string;
  readonly VITE_MAPY_TILE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
