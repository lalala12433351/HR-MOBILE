import { env } from '../config/env.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const brand = {
  ink: '#0f1115',
  body: '#3c4149',
  muted: '#80868f',
  hairline: '#ebedf0',
  canvas: '#f5f6f7',
  card: '#ffffff',
  well: '#f5f6f7',
};

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Roboto,Helvetica,Arial,sans-serif`;
const MONO = `'SF Mono','SFMono-Regular',ui-monospace,Menlo,Consolas,monospace`;

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Table-based so the button keeps its shape in Outlook. */
export function button(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
  <tr>
    <td class="btn" bgcolor="${brand.ink}" style="border-radius:8px;background:${brand.ink};">
      <a class="btn-label" href="${safeHref}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export function paragraph(html: string): string {
  return `<p class="text" style="margin:0 0 16px;font-size:15px;line-height:24px;color:${brand.body};">${html}</p>`;
}

export function strong(text: string): string {
  return `<strong class="strong" style="font-weight:600;color:${brand.ink};">${escapeHtml(text)}</strong>`;
}

export function linkFallback(href: string): string {
  const safe = escapeHtml(href);
  return `
<p class="muted" style="margin:20px 0 0;font-size:13px;line-height:20px;color:${brand.muted};">
  Or paste this link into your browser:<br />
  <a class="link" href="${safe}" target="_blank" style="color:${brand.body};word-break:break-all;text-decoration:underline;">${safe}</a>
</p>`;
}

/** Label/value rows separated by hairlines. */
export function detailsPanel(rows: Array<[string, string]>): string {
  const body = rows
    .filter(([, v]) => Boolean(v))
    .map(
      ([k, v]) => `
    <tr>
      <td class="rule muted" style="padding:12px 0;border-top:1px solid ${brand.hairline};font-size:13px;line-height:20px;color:${brand.muted};width:132px;vertical-align:top;">${escapeHtml(k)}</td>
      <td class="rule strong" style="padding:12px 0;border-top:1px solid ${brand.hairline};font-size:14px;line-height:20px;color:${brand.ink};font-weight:500;">${escapeHtml(v)}</td>
    </tr>`
    )
    .join('');
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;border-bottom:1px solid ${brand.hairline};" class="rule">${body}</table>`;
}

/** One-time code shown large in a monospace well. */
export function codeBlock(code: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;">
  <tr>
    <td class="well strong" style="padding:16px 14px 16px 24px;border-radius:10px;background:${brand.well};font-family:${MONO};font-size:32px;line-height:40px;font-weight:600;letter-spacing:10px;color:${brand.ink};">${escapeHtml(code)}</td>
  </tr>
</table>`;
}

/** Small print, separated from the body by a hairline. */
export function notice(html: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0;">
  <tr>
    <td class="rule muted" style="padding-top:20px;border-top:1px solid ${brand.hairline};font-size:13px;line-height:20px;color:${brand.muted};">${html}</td>
  </tr>
</table>`;
}

export interface LayoutOptions {
  preheader: string;
  heading: string;
  bodyHtml: string;
  workspaceName?: string;
}

export function renderLayout(opts: LayoutOptions): string {
  const brandName = escapeHtml(env.EMAIL_BRAND_NAME);
  const workspace = opts.workspaceName ? escapeHtml(opts.workspaceName) : '';
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(opts.heading)}</title>
  <style>
    a { text-decoration-thickness: 1px; text-underline-offset: 2px; }
    @media (max-width: 600px) {
      .container { width: 100% !important; }
      .card-pad { padding: 32px 24px !important; }
      .h1 { font-size: 22px !important; line-height: 30px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .canvas, body { background: #0b0c0e !important; }
      .card { background: #15171a !important; border-color: #24272b !important; }
      .wordmark, .h1, .strong { color: #f4f5f6 !important; }
      .text { color: #c3c7cd !important; }
      .muted, .foot { color: #7d838c !important; }
      .link { color: #c3c7cd !important; }
      .rule { border-color: #24272b !important; }
      .well { background: #1e2125 !important; }
      .btn { background: #f4f5f6 !important; }
      .btn-label { color: #0f1115 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${brand.canvas};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(opts.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="canvas" style="background:${brand.canvas};">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="container" style="width:560px;max-width:560px;font-family:${FONT};">
          <tr>
            <td class="wordmark" style="padding:0 4px 20px;font-size:17px;line-height:24px;font-weight:700;letter-spacing:-0.3px;color:${brand.ink};">${brandName}</td>
          </tr>
          <tr>
            <td class="card card-pad" style="background:${brand.card};border:1px solid ${brand.hairline};border-radius:14px;padding:44px 44px 40px;">
              <h1 class="h1" style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-0.4px;color:${brand.ink};">${escapeHtml(opts.heading)}</h1>
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td class="foot" style="padding:24px 4px 0;font-size:12px;line-height:18px;color:${brand.muted};">
              ${workspace ? `Sent by ${brandName} on behalf of ${workspace}.` : `Sent by ${brandName}.`} This is an automated message.<br />
              &copy; ${year} ${brandName}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
