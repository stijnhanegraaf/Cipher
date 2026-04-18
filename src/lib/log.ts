/**
 * Tiny debug-gated logger. Production silences debug + info; warn + error
 * always pass through because they are real signals worth reading.
 * Toggle verbose mode with NEXT_PUBLIC_CIPHER_DEBUG=1 in .env.local.
 */
const verbose =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_CIPHER_DEBUG === "1";

type Scope = string;

function format(scope: Scope, msg: string): string {
  return `[${scope}] ${msg}`;
}

export const log = {
  debug(scope: Scope, msg: string, ...data: unknown[]) {
    if (!verbose) return;
    console.debug(format(scope, msg), ...data);
  },
  info(scope: Scope, msg: string, ...data: unknown[]) {
    if (!verbose) return;
    console.info(format(scope, msg), ...data);
  },
  warn(scope: Scope, msg: string, ...data: unknown[]) {
    console.warn(format(scope, msg), ...data);
  },
  error(scope: Scope, msg: string, ...data: unknown[]) {
    console.error(format(scope, msg), ...data);
  },
};
