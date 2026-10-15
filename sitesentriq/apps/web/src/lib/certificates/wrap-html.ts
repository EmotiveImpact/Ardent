// src/lib/certificates/wrap-html.ts
// Wrap rendered template markup in a self-contained HTML document
// suitable for printing AND for saving to Supabase storage as a
// portable record.
//
// We pull the Plus Jakarta Sans font from Google Fonts so the saved
// file looks identical when opened standalone. Print CSS is baked in
// so window.print() produces a clean A4 document.

interface WrapOptions {
  title: string
  bodyHtml: string
}

export function wrapCertificateHtml({ title, bodyHtml }: WrapOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f8fafc; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont,
                   'Segoe UI', Roboto, sans-serif;
      color: #374151;
      -webkit-font-smoothing: antialiased;
    }
    @page {
      size: A4;
      margin: 16mm;
    }
    @media print {
      html, body { background: #ffffff; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
