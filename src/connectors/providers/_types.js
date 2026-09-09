// Type catalog for the provider plugin contract.
//
// This file is documentation-only — pure JSDoc @typedef annotations. The
// project is plain ESM JavaScript with no build step; provider authors can
// reference these types via `/** @typedef {import('./_types.js').Provider} Provider */`
// at the top of a `// @ts-check`-enabled file to get IDE hints. The runtime
// contract is enforced by _registry.mjs and ../structured.mjs, not by
// these annotations.
//
// Files prefixed with _ are never loaded as providers by _registry.mjs.

/**
 * Normalized job posting — the unit of currency throughout the scanner.
 *
 * @typedef {object} Job
 * @property {string} title    Required, non-empty after trim.
 * @property {string} url      Required, absolute URL — used as the dedup key.
 * @property {string} company  May be empty when the source can't expose it
 *                             at the list-page level; populated downstream.
 * @property {string} location May be empty.
 * @property {string} [description] Job description when supplied by the source.
 * @property {number} [postedAt] Publication time in epoch milliseconds; absent
 *                               when unknown. Used for configured recency checks.
 */

/**
 * A single `tracked_companies` entry from `portals.yml`.
 *
 * Provider-specific fields are opaque to the registry and validated by the
 * provider itself. Examples in current providers: `api`, `careers_url`.
 * Providers read these directly off the entry object — no schema enforcement
 * at the framework level.
 *
 * @typedef {object} PortalEntry
 * @property {string}             name             User-facing label; appears in logs and placeholders.
 * @property {boolean}            [enabled]        Default: true.
 * @property {string}             [careers_url]    Public listing URL; consumed by detect().
 * @property {string}             [api]            JSON API URL; used directly by greenhouse/ashby providers.
 * @property {string}             [provider]       Explicit provider id — bypasses detect().
 * @property {number}             [max_pages]      Provider-specific pagination cap (avature, workday).
 * @property {string}             [offset_param]   avature only: pins the pagination query key and disables the
 *                                                 provider's jobOffset→offset self-heal. Rarely needed — an
 *                                                 escape hatch for a tenant the auto-switch can't resolve.
 */

/**
 * Returned by `detect()` when a provider claims an entry. `url` is
 * informational (used in logs); routing only checks for a non-null return.
 *
 * @typedef {object} DetectHit
 * @property {string} url
 */

/**
 * Options forwarded to the underlying `fetch` call.
 *
 * @typedef {object} FetchOptions
 * @property {number}                [timeoutMs]
 * @property {Object<string,string>} [headers]
 * @property {string}                [method]
 * @property {(string|null)}         [body]
 * @property {('error'|'follow'|'manual')} [redirect]
 */

/**
 * HTTP context supplied to provider.fetch() by ../structured.mjs.
 *
 * @typedef {object} Context
 * @property {('http')} transport
 * @property {(url: string, opts?: FetchOptions) => Promise<string>}  fetchText
 * @property {(url: string, opts?: FetchOptions) => Promise<unknown>} fetchJson
 * @property {number} [maxPages] Optional pagination hint for providers that support it.
 * @property {(ms: number) => Promise<void>} [sleep] Optional cross-provider pacing hook used by
 *                              paginating providers (avature, workday) to throttle between page
 *                              requests. May be absent — providers fall back to a native
 *                              `setTimeout`-based delay.
 */

/**
 * The provider contract — the default export of every providers/*.mjs file
 * (excluding _-prefixed shared helpers).
 *
 * @typedef {object} Provider
 * @property {string} id                                                       Unique across all loaded providers.
 * @property {((entry: PortalEntry) => (DetectHit | null))} [detect]           Optional auto-detection.
 * @property {(entry: PortalEntry, ctx: Context) => Promise<Job[]>} fetch      Required.
 */

export {};
