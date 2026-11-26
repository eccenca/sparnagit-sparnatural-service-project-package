/*
 * CMEM look: copies the live --eccgui-* design tokens of the surrounding CMEM page (same origin) onto this page,
 * so sparnatural-theme-cmem.css follows customer branding. Runs in the browser and in node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).theme = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOKEN_NAMES = [
    '--eccgui-color-primary',
    '--eccgui-color-palette-layout-amber-900',
    '--eccgui-color-palette-identity-brand-500',
    '--eccgui-color-primary-contrast',
    '--eccgui-color-accent',
    '--eccgui-color-palette-layout-petrol-900',
    '--eccgui-color-palette-identity-accent-500',
    '--eccgui-color-palette-layout-petrol-700',
    '--eccgui-color-accent-contrast',
    '--eccgui-color-palette-extra-silver-900',
    '--eccgui-color-palette-extra-silver-300',
    '--eccgui-color-palette-identity-text-900',
    '--eccgui-a11y-outline-color',
    '--eccgui-size-typo-text',
  ];

  function copyTokens(source, target, names = TOKEN_NAMES) {
    if (!source || !target) return 0;
    let n = 0;
    for (const name of names) {
      const v = String(source.getPropertyValue(name) || '').trim();
      if (v) {
        target.style.setProperty(name, v);
        n++;
      }
    }
    return n;
  }

  return { TOKEN_NAMES, copyTokens };
});
