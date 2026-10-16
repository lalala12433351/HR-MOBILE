export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Allow only image data URLs, http(s) and same-origin paths inside generated print markup. */
export function safeImageSrc(src: string | undefined | null): string {
  const trimmed = (src || '').trim();
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/.test(trimmed)) return trimmed;
  if (/^https?:\/\/[^\s"'<>]+$/.test(trimmed)) return trimmed;
  if (/^\/(?!\/)[^\s"'<>]+$/.test(trimmed)) return trimmed;
  return '';
}

export function newPrintId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const PRINT_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap';

/** Shared reset so print output matches the on-screen preview, including background fills. */
export const PRINT_BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
    color: #172234;
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  p, h1, h2, h3, dl, dd, dt, figure { margin: 0; }
  img { display: block; }
  .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
`;

export function buildPrintHtml(options: { title: string; styles: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${PRINT_FONT_HREF}" />
  <style>${PRINT_BASE_STYLES}${options.styles}</style>
</head>
<body>${options.body}</body>
</html>`;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Resolve once stylesheets, images and web fonts in `doc` have loaded (or after a timeout). */
export async function waitForDocumentAssets(doc: Document, timeoutMs = 3000): Promise<void> {
  const sheets = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) =>
    link.sheet
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          link.addEventListener('load', () => resolve(), { once: true });
          link.addEventListener('error', () => resolve(), { once: true });
        })
  );
  const images = Array.from(doc.images).map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        })
  );

  const ready = (async () => {
    await Promise.all([...sheets, ...images]);
    void doc.body?.offsetHeight;
    if (doc.fonts) await doc.fonts.ready.catch(() => undefined);
  })();

  await Promise.race([ready, delay(timeoutMs)]);
}

/**
 * Print a standalone HTML document through a hidden iframe. Unlike `window.open`,
 * this is not blocked by pop-up blockers and keeps the user on the current page.
 */
export async function printHtml(options: {
  title: string;
  styles: string;
  body: string;
  assetTimeoutMs?: number;
}): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(buildPrintHtml(options));
  doc.close();

  await waitForDocumentAssets(doc, options.assetTimeoutMs ?? 3000);

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };
  win.addEventListener('afterprint', () => setTimeout(cleanup, 100), { once: true });
  setTimeout(cleanup, 60_000);

  try {
    win.focus();
    win.print();
    return true;
  } catch {
    cleanup();
    return false;
  }
}
