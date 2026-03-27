import { getCityGeoProfile } from "@/lib/accidentInsights";

export async function POST(req) {
  let city = "";

  try {
    const payload = await req.json();
    city = payload.city || "";
    const localMatch = getCityGeoProfile(city);

    if (localMatch?.matchedCity) {
      return Response.json({
        lat: localMatch.lat,
        lon: localMatch.lon,
        bbox: localMatch.bbox,
        source: "dataset"
      });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      city
    )}&countrycodes=in&limit=1`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "smart-accident-risk-system"
      }
    });

    const data = await res.json();

    if (!data || data.length === 0) {
      if (localMatch) {
        return Response.json({
          lat: localMatch.lat,
          lon: localMatch.lon,
          bbox: localMatch.bbox,
          source: "dataset-fallback"
        });
      }

      return Response.json({ error: "City not found in India" }, { status: 404 });
    }

    const place = data[0];

    if (!place.display_name.toLowerCase().includes("india")) {
      return Response.json(
        { error: "Location outside India" },
        { status: 400 }
      );
    }

    return Response.json({
      lat: parseFloat(place.lat),
      lon: parseFloat(place.lon),
      bbox: place.boundingbox.map(Number),
      source: "nominatim"
    });

  } catch {
    const fallback = getCityGeoProfile(city);

    if (fallback) {
      return Response.json({
        lat: fallback.lat,
        lon: fallback.lon,
        bbox: fallback.bbox,
        source: "dataset-fallback"
      });
    }

    return Response.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
