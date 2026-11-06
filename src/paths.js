const root = new URL('../', import.meta.url);

// The same Lesson JSON paths work at localhost / and under a project website.
export function siteAsset(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return value;
  return new URL(value.slice(1), root).href;
}
