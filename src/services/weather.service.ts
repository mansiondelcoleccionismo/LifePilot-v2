export interface WeatherData {
  tempMax: number
  tempMin: number
  precipitationProb: number
  weatherCode: number
  description: string
  emoji: string
  fetchedAt: number
}

const CACHE_KEY = 'lifepilot_weather_cache'
const CACHE_TTL_MS = 60 * 60 * 1000

function describeCode(code: number): { description: string; emoji: string } {
  if (code === 0)                               return { description: 'Despejado',           emoji: '☀️' }
  if (code <= 3)                                return { description: 'Parcialmente nublado', emoji: '⛅' }
  if (code === 45 || code === 48)               return { description: 'Niebla',               emoji: '🌫️' }
  if ((code >= 51 && code <= 55) ||
      (code >= 61 && code <= 65))               return { description: 'Lluvia',               emoji: '🌧️' }
  if (code >= 71 && code <= 75)                 return { description: 'Nieve',                emoji: '❄️' }
  if (code >= 80 && code <= 82)                 return { description: 'Chubascos',            emoji: '🌦️' }
  if (code === 95)                              return { description: 'Tormenta',             emoji: '⛈️' }
  return { description: 'Variable', emoji: '🌤️' }
}

export async function getWeatherToday(): Promise<WeatherData | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as WeatherData
      if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) return parsed
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude=41.7897&longitude=-1.1358' +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=Europe%2FMadrid&forecast_days=1',
    )
    if (!res.ok) return null
    const json = await res.json()
    const d = json.daily
    const code = d.weathercode[0] as number
    const { description, emoji } = describeCode(code)
    const data: WeatherData = {
      tempMax:          Math.round(d.temperature_2m_max[0]),
      tempMin:          Math.round(d.temperature_2m_min[0]),
      precipitationProb: d.precipitation_probability_max[0] as number,
      weatherCode:      code,
      description,
      emoji,
      fetchedAt:        Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    return data
  } catch {
    return null
  }
}
