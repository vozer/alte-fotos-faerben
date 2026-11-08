import type { DesktopApi } from "./model";

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
