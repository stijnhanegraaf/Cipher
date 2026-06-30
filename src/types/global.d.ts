/**
 * Global Window augmentation — typed bindings for values injected by the
 * layout bootstrap script (src/app/layout.tsx) via an inline <script> tag.
 * These cannot be typed at the call site without an awkward cast, so we
 * declare them here instead. The assignment still happens in the script;
 * this file only provides the TypeScript type.
 */
declare global {
  interface Window {
    /** Updates the meta theme-color live when the user toggles the app theme. */
    __setThemeColor?: (t: string) => void;
  }
}

// Makes this file a module so the global augmentation is applied.
export {};
