export interface OpenFoodResult {
  id: string
  name: string
  brand: string
  per100g: {
    kcal: number
    protein: number
    carbs: number
    fat: number
  }
}

export async function searchFoods(query: string): Promise<OpenFoodResult[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&lc=es&cc=es&page_size=20`

  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const products: unknown[] = data.products ?? []

    return products
      .filter((p: any) => {
        const n = p.nutriments ?? {}
        return (
          p.product_name &&
          n['energy-kcal_100g'] != null &&
          n['proteins_100g'] != null &&
          n['carbohydrates_100g'] != null &&
          n['fat_100g'] != null
        )
      })
      .map((p: any) => ({
        id: String(p._id ?? p.id ?? p.code ?? Math.random()),
        name: (p.product_name_es || p.product_name || 'Sin nombre').trim(),
        brand: (p.brands ?? '').split(',')[0].trim(),
        per100g: {
          kcal: Math.round(p.nutriments['energy-kcal_100g']),
          protein: Math.round(p.nutriments['proteins_100g'] * 10) / 10,
          carbs: Math.round(p.nutriments['carbohydrates_100g'] * 10) / 10,
          fat: Math.round(p.nutriments['fat_100g'] * 10) / 10,
        },
      }))
  } catch {
    return []
  }
}
