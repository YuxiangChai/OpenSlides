/**
 * CDN URL mapping for China mirror support.
 * When China CDN mode is enabled, global CDN URLs are replaced with
 * China-accessible mirrors (bootcdn.cn, fonts.googleapis.cn).
 */

const CDN_REPLACEMENTS: [RegExp, string][] = [
  // reveal.js: jsdelivr → bootcdn
  [
    /https:\/\/cdn\.jsdelivr\.net\/npm\/reveal\.js@([^/]+)/g,
    'https://cdn.bootcdn.net/ajax/libs/reveal.js/$1',
  ],
  // Chart.js: jsdelivr → bootcdn
  [
    /https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@([^/]+)\/dist\/chart\.umd\.min\.js/g,
    'https://cdn.bootcdn.net/ajax/libs/Chart.js/$1/chart.umd.min.js',
  ],
  // Font Awesome: cloudflare → bootcdn
  [
    /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/([^/]+)/g,
    'https://cdn.bootcdn.net/ajax/libs/font-awesome/$1',
  ],
  // Google Fonts: googleapis.com → googleapis.cn
  [/https:\/\/fonts\.googleapis\.com/g, 'https://fonts.googleapis.cn'],
  // Google Fonts preconnect
  [/https:\/\/fonts\.gstatic\.com/g, 'https://fonts.gstatic.cn'],
];

/**
 * Replace global CDN URLs with China mirror URLs in an HTML string.
 */
export function applyChinaCDN(html: string): string {
  let result = html;
  for (const [pattern, replacement] of CDN_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Get CDN base URLs for use in templates.
 */
export function getCDNUrls(useChinaCDN: boolean) {
  if (useChinaCDN) {
    return {
      revealBase: 'https://cdn.bootcdn.net/ajax/libs/reveal.js/5.1.0',
      chartJs: 'https://cdn.bootcdn.net/ajax/libs/Chart.js/4.4.7/chart.umd.min.js',
      fontAwesome: 'https://cdn.bootcdn.net/ajax/libs/font-awesome/6.5.1/css/all.min.css',
      googleFonts: 'https://fonts.googleapis.cn',
      googleFontsStatic: 'https://fonts.gstatic.cn',
    };
  }
  return {
    revealBase: 'https://cdn.jsdelivr.net/npm/reveal.js@5.1.0',
    chartJs: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
    fontAwesome: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    googleFonts: 'https://fonts.googleapis.com',
    googleFontsStatic: 'https://fonts.gstatic.com',
  };
}
