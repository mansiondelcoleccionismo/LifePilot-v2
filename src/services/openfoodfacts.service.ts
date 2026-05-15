export interface OpenFoodResult {
  id: string
  name: string
  brand: string
  imageUrl?: string
  per100g: {
    kcal: number
    protein: number
    carbs: number
    fat: number
  }
}

export async function searchFoods(query: string): Promise<OpenFoodResult[]> {
  const offUrl =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=20` +
    `&fields=id,_id,code,product_name,product_name_es,brands,nutriments,image_front_small_url`

  const url = `https://corsproxy.io/?${encodeURIComponent(offUrl)}`

  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const products: unknown[] = data.products ?? []

    return products
      .filter((p: any) => {
        if (!p.product_name) return false
        const n = p.nutriments ?? {}
        const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : null)
        return (
          kcal != null &&
          n['proteins_100g'] != null &&
          n['carbohydrates_100g'] != null &&
          n['fat_100g'] != null
        )
      })
      .slice(0, 15)
      .map((p: any) => {
        const n = p.nutriments
        const kcal = n['energy-kcal_100g'] ?? n['energy_100g'] / 4.184
        const rawImg = p.image_front_small_url as string | undefined
        return {
          id: String(p._id ?? p.id ?? p.code ?? Math.random()),
          name: (p.product_name_es || p.product_name || 'Sin nombre').trim(),
          brand: (p.brands ?? '').split(',')[0].trim(),
          imageUrl: rawImg && rawImg.startsWith('http') ? rawImg : undefined,
          per100g: {
            kcal: Math.round(kcal),
            protein: Math.round(n['proteins_100g'] * 10) / 10,
            carbs: Math.round(n['carbohydrates_100g'] * 10) / 10,
            fat: Math.round(n['fat_100g'] * 10) / 10,
          },
        }
      })
  } catch {
    return []
  }
}
