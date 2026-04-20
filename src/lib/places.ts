export interface PlaceContact {
  phone?: string;
  website?: string;
}

export interface PlaceRichDetails extends PlaceContact {
  editorialSummary?: string;
  types?: string[];
  rating?: number;
  userRatingsTotal?: number;
  openingHours?: string[];
  businessStatus?: string;
  priceLevel?: number;
}

export async function getPlaceContact(placeId: string): Promise<PlaceContact> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return {};

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=formatted_phone_number,website&key=${key}`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    const json = await res.json();
    if (json.status !== "OK") return {};
    return {
      phone: json.result?.formatted_phone_number,
      website: json.result?.website,
    };
  } catch {
    return {};
  }
}

export async function findPlaceContact(name: string, address: string): Promise<PlaceContact> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return {};

  const query = encodeURIComponent(`${name} ${address}`);
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${key}`;
  try {
    const res = await fetch(searchUrl, { next: { revalidate: 86400 } });
    const json = await res.json();
    const placeId = json.results?.[0]?.place_id;
    if (!placeId) return {};
    return getPlaceContact(placeId);
  } catch {
    return {};
  }
}
