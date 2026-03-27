import { planRiskAwareRoutes } from "@/lib/routePlanner";

function encodeCoordinates(points = []) {
  return points.map((point) => `${point.lon},${point.lat}`).join(";");
}

async function fetchRoadGeometry(points) {
  if (!points?.length || points.length < 2) return null;

  const coordinates = encodeCoordinates(points);
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "smart-accident-risk-system"
    },
    next: { revalidate: 0 }
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const route = payload?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;

  const mappedPoints = route.geometry.coordinates.map(([lon, lat]) => ({
    lat,
    lon
  }));

  return {
    points: mappedPoints,
    distanceKm: Number((route.distance / 1000).toFixed(1)),
    durationMin: Math.round(route.duration / 60)
  };
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const basePlan = planRiskAwareRoutes(payload);

    if (!basePlan?.options?.length) {
      return Response.json({ error: "Unable to build route options" }, { status: 400 });
    }

    const enrichedOptions = await Promise.all(
      basePlan.options.map(async (option) => {
        try {
          const roadGeometry = await fetchRoadGeometry(option.points);

          if (!roadGeometry) {
            return option;
          }

          return {
            ...option,
            points: roadGeometry.points,
            distanceKm: roadGeometry.distanceKm,
            durationMin: roadGeometry.durationMin
          };
        } catch {
          return option;
        }
      })
    );

    return Response.json({
      ...basePlan,
      options: enrichedOptions
    });
  } catch {
    return Response.json({ error: "Unable to compute routed path" }, { status: 400 });
  }
}
