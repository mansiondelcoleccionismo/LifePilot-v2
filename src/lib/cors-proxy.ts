const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/',
]

function buildProxyUrl(proxy: string, url: string): string {
  // cors-anywhere appends the URL in the path (no query string → no encoding)
  if (!proxy.includes('?') && !proxy.includes('=')) return `${proxy}${url}`
  // corsproxy.io and allorigins use a query param value → encode
  return `${proxy}${encodeURIComponent(url)}`
}

export async function fetchWithCorsProxy(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown
  for (const proxy of CORS_PROXIES) {
    const proxyUrl = buildProxyUrl(proxy, url)
    try {
      const res = await fetch(proxyUrl, init)
      if (res.status >= 400) {
        lastError = new Error(`HTTP ${res.status} (${proxy})`)
        continue
      }
      return res
    } catch (err) {
      lastError = err
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`No se pudo conectar tras ${CORS_PROXIES.length} proxies: ${msg}`)
}
