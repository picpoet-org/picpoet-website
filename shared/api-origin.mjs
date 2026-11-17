export function apiOrigin(pageOrigin = globalThis.location?.origin || '') {
  return pageOrigin === 'https://picpoet.jqknono.com' ? 'https://picpoet-api.jqknono.com' : '';
}

export function apiURL(path) {
  return `${apiOrigin()}/web-api${path}`;
}
