const TMDB_KEY_STORAGE = 'lifepilot_tmdb_key'
const CACHE_KEY = 'lifepilot_tmdb_cache'
const CACHE_TTL = 24 * 60 * 60 * 1000

const BASE = 'https://api.themoviedb.org/3'
export const POSTER_BASE       = 'https://image.tmdb.org/t/p/w500'
export const POSTER_BASE_SMALL = 'https://image.tmdb.org/t/p/w342'

export interface TmdbResult {
  tmdbId: number
  title: string
  posterUrl?: string
  year?: number
  tmdbRating?: number
  synopsis?: string
  mediaType: 'pelicula' | 'serie' | 'anime'
  director?: string
  genres?: string[]
  duration?: number
  totalEpisodes?: number
  trailerUrl?: string
}

// ── Key management ─────────────────────────────────────────────────────────
export function hasTmdbKey(): boolean {
  return !!(localStorage.getItem(TMDB_KEY_STORAGE)?.trim())
}

export function getTmdbKey(): string {
  return localStorage.getItem(TMDB_KEY_STORAGE)?.trim() ?? ''
}

export function saveTmdbKey(key: string) {
  localStorage.setItem(TMDB_KEY_STORAGE, key.trim())
}

// ── Cache ──────────────────────────────────────────────────────────────────
function getCache(): Record<string, { data: unknown; ts: number }> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') }
  catch { return {} }
}

function fromCache<T>(key: string): T | null {
  const entry = getCache()[key]
  if (!entry || Date.now() - entry.ts > CACHE_TTL) return null
  return entry.data as T
}

function setCache(key: string, data: unknown) {
  const cache = getCache()
  cache[key] = { data, ts: Date.now() }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* quota */ }
}

// ── Fetch helper ───────────────────────────────────────────────────────────
async function tmdbFetch<T>(path: string): Promise<T> {
  const key = getTmdbKey()
  if (!key) throw new Error('Sin clave TMDB')
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${BASE}${path}${sep}api_key=${key}&language=es-ES`)
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json() as Promise<T>
}

// ── Mapper ────────────────────────────────────────────────────────────────
function mapItem(item: Record<string, unknown>, forceType?: string): TmdbResult {
  const mt = forceType ?? (item.media_type as string) ?? 'movie'
  return {
    tmdbId: item.id as number,
    title: (item.title ?? item.name ?? '') as string,
    posterUrl: item.poster_path ? `${POSTER_BASE}${item.poster_path}` : undefined,
    year: parseInt(((item.release_date ?? item.first_air_date) as string ?? '').slice(0, 4)) || undefined,
    tmdbRating: typeof item.vote_average === 'number' ? Math.round((item.vote_average as number) * 10) / 10 : undefined,
    synopsis: item.overview as string | undefined,
    mediaType: mt === 'tv' ? 'serie' : 'pelicula',
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function searchContent(searchQuery: string, type?: 'movie' | 'tv'): Promise<TmdbResult[]> {
  if (!searchQuery.trim()) return []
  const cacheKey = `search_${type ?? 'multi'}_${searchQuery}`
  const cached = fromCache<TmdbResult[]>(cacheKey)
  if (cached) return cached

  const endpoint = type ? `/search/${type}` : '/search/multi'
  const data = await tmdbFetch<{ results: Record<string, unknown>[] }>(`${endpoint}?query=${encodeURIComponent(searchQuery)}`)
  const results = data.results
    .filter(r => r.media_type !== 'person')
    .map(r => mapItem(r, type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : undefined))
    .slice(0, 10)

  setCache(cacheKey, results)
  return results
}

export async function getContentDetails(tmdbId: number, type: 'movie' | 'tv'): Promise<TmdbResult> {
  const cacheKey = `details_${type}_${tmdbId}`
  const cached = fromCache<TmdbResult>(cacheKey)
  if (cached) return cached

  const [details, videos] = await Promise.all([
    tmdbFetch<Record<string, unknown>>(`/${type}/${tmdbId}?append_to_response=credits`),
    tmdbFetch<{ results: Array<{ type: string; site: string; key: string }> }>(`/${type}/${tmdbId}/videos`),
  ])

  const trailer = videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube')
  const genres = (details.genres as Array<{ name: string }> | undefined)?.map(g => g.name) ?? []
  const credits = details.credits as { crew?: Array<{ job: string; name: string }> } | undefined
  const director = credits?.crew?.find(c => c.job === 'Director')?.name
  const runtime = details.runtime as number | undefined
  const episodeRuntime = details.episode_run_time as number[] | undefined

  const result: TmdbResult = {
    tmdbId: details.id as number,
    title: (details.title ?? details.name ?? '') as string,
    posterUrl: details.poster_path ? `${POSTER_BASE}${details.poster_path}` : undefined,
    year: parseInt(((details.release_date ?? details.first_air_date) as string ?? '').slice(0, 4)) || undefined,
    tmdbRating: typeof details.vote_average === 'number' ? Math.round((details.vote_average as number) * 10) / 10 : undefined,
    synopsis: details.overview as string | undefined,
    mediaType: type === 'tv' ? 'serie' : 'pelicula',
    director,
    genres,
    duration: runtime ?? episodeRuntime?.[0],
    totalEpisodes: type === 'tv' ? (details.number_of_episodes as number | undefined) : undefined,
    trailerUrl: trailer ? `https://www.youtube.com/embed/${trailer.key}` : undefined,
  }

  setCache(cacheKey, result)
  return result
}

export async function getSimilar(tmdbId: number, type: 'movie' | 'tv'): Promise<TmdbResult[]> {
  const cacheKey = `similar_${type}_${tmdbId}`
  const cached = fromCache<TmdbResult[]>(cacheKey)
  if (cached) return cached

  const data = await tmdbFetch<{ results: Record<string, unknown>[] }>(`/${type}/${tmdbId}/similar`)
  const results = data.results.map(r => mapItem(r, type)).slice(0, 12)
  setCache(cacheKey, results)
  return results
}

export async function getTrending(type: 'all' | 'movie' | 'tv' = 'all', timeWindow: 'day' | 'week' = 'week'): Promise<TmdbResult[]> {
  const cacheKey = `trending_${type}_${timeWindow}`
  const cached = fromCache<TmdbResult[]>(cacheKey)
  if (cached) return cached

  const data = await tmdbFetch<{ results: Record<string, unknown>[] }>(`/trending/${type}/${timeWindow}`)
  const results = data.results.map(r => mapItem(r)).slice(0, 20)
  setCache(cacheKey, results)
  return results
}

export async function getPosterUrl(title: string, year?: number): Promise<string | undefined> {
  return resolvePosterUrl({ title, year })
}

// Module-level runtime cache — avoids duplicate fetches within a session
const _posterRuntime = new Map<string, string | null>()

async function searchPosterPath(title: string, year?: number, type: 'movie' | 'tv' = 'movie'): Promise<string | null> {
  const apiKey = getTmdbKey()
  if (!apiKey) { console.warn('[TMDB] No API key found in localStorage key:', 'lifepilot_tmdb_key'); return null }

  // Build URL manually so year is a proper param, not part of the query string
  const yearParam = year && year > 0 ? `&year=${year}&primary_release_year=${year}` : ''
  const url = `${BASE}/search/${type}?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(title)}${yearParam}`

  console.log(`[TMDB] Searching poster: ${type} "${title}" year=${year ?? 'none'}`)
  console.log(`[TMDB] URL: ${url.replace(apiKey, 'KEY')}`)

  const res = await fetch(url)
  if (!res.ok) { console.error(`[TMDB] HTTP ${res.status}`); return null }

  const data = await res.json() as { results: Array<{ poster_path?: string | null; title?: string; name?: string }> }
  console.log(`[TMDB] Results (${type}):`, data.results.slice(0, 3).map(r => ({ title: r.title ?? r.name, poster: r.poster_path })))

  if (data.results.length > 0 && data.results[0].poster_path) {
    return data.results[0].poster_path
  }

  // Retry without year if we had one and got no results
  if (year && year > 0 && data.results.length === 0) {
    console.log(`[TMDB] No results with year, retrying without year...`)
    const urlNoYear = `${BASE}/search/${type}?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(title)}`
    const res2 = await fetch(urlNoYear)
    if (res2.ok) {
      const data2 = await res2.json() as { results: Array<{ poster_path?: string | null }> }
      console.log(`[TMDB] Retry results:`, data2.results.slice(0, 3).map(r => ({ poster: r.poster_path })))
      if (data2.results[0]?.poster_path) return data2.results[0].poster_path
    }
  }

  return null
}

export async function resolvePosterUrl(opts: {
  tmdbId?: number
  title: string
  year?: number
  mediaType?: 'movie' | 'tv'
  originalTitle?: string
}): Promise<string | undefined> {
  const { tmdbId, title, year, mediaType, originalTitle } = opts
  const key = tmdbId ? `id_${mediaType ?? 'movie'}_${tmdbId}` : `q_${title}_${year ?? ''}`

  if (_posterRuntime.has(key)) return _posterRuntime.get(key) ?? undefined

  console.log(`[TMDB] resolvePosterUrl: title="${title}" originalTitle="${originalTitle ?? ''}" year=${year} tmdbId=${tmdbId} keyExists=${!!getTmdbKey()}`)

  try {
    let posterPath: string | null = null

    if (tmdbId) {
      const type = mediaType ?? 'movie'
      const data = await tmdbFetch<{ poster_path?: string }>(`/${type}/${tmdbId}`)
      posterPath = data.poster_path ?? null
      console.log(`[TMDB] Direct ID lookup poster_path: ${posterPath}`)
    } else {
      const type = mediaType === 'tv' ? 'tv' : 'movie'

      // 1. Try with the given title
      posterPath = await searchPosterPath(title, year, type)

      // 2. Try with original title if different
      if (!posterPath && originalTitle && originalTitle !== title) {
        console.log(`[TMDB] Trying with original title: "${originalTitle}"`)
        posterPath = await searchPosterPath(originalTitle, year, type)
      }

      // 3. Cross-type fallback (movie ↔ tv)
      if (!posterPath) {
        const altType = type === 'movie' ? 'tv' : 'movie'
        console.log(`[TMDB] Trying ${altType} search...`)
        posterPath = await searchPosterPath(title, year, altType)
      }
    }

    const url = posterPath ? `${POSTER_BASE_SMALL}${posterPath}` : null
    console.log(`[TMDB] Final poster URL: ${url}`)
    _posterRuntime.set(key, url)
    return url ?? undefined
  } catch (err) {
    console.error('[TMDB] resolvePosterUrl error:', err)
    _posterRuntime.set(key, null)
    return undefined
  }
}
