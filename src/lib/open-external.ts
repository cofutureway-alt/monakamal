/**
 * Opening a Zoom URL in a new tab.
 *
 * `window.open(url, "_blank", "noopener,noreferrer")` always returns null by
 * spec, so a null return says nothing about whether a popup was blocked. The
 * only reliable pattern is to open a blank tab synchronously inside the click
 * handler, await whatever produces the real URL, then navigate that tab.
 */

/** Opens a placeholder tab immediately; returns the handle or null when blocked. */
export function preOpenTab(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

/** Navigates a pre-opened tab and detaches it from this window. */
export function navigatePreOpened(tab: Window, url: string): void {
  try {
    tab.opener = null;
  } catch {
    // Cross-origin handles throw on assignment; navigation below still works.
  }
  tab.location.href = url;
}

/**
 * Synchronously open a tab, await the URL, then send that tab there.
 * Returns `{ blocked: true, url }` when the popup was refused so the caller can
 * render a real fallback link.
 */
export async function openExternalAfter(
  produceUrl: () => Promise<string>,
): Promise<{ blocked: boolean; url: string | null }> {
  const tab = preOpenTab();
  try {
    const url = await produceUrl();
    if (!tab || tab.closed) return { blocked: true, url };
    navigatePreOpened(tab, url);
    return { blocked: false, url };
  } catch (e) {
    tab?.close();
    throw e;
  }
}
