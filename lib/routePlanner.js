function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(a, b) {
  const earthRadius = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadius * c;
}

function midpoint(a, b) {
  return {
    lat: Number(((a.lat + b.lat) / 2).toFixed(6)),
    lon: Number(((a.lon + b.lon) / 2).toFixed(6))
  };
}

function roadPoint(point) {
  return {
    lat: point[0],
    lon: point[1]
  };
}

function routeDistance(points) {
  let total = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    total += haversineKm(points[index], points[index + 1]);
  }

  return Number(total.toFixed(1));
}

function hotspotPenalty(points, hotspots = []) {
  if (!hotspots.length) return 0;

  let penalty = 0;

  for (const point of points) {
    for (const hotspot of hotspots.slice(0, 10)) {
      const distance = haversineKm(point, hotspot);
      if (distance < 1.2) penalty += hotspot.hazardScore;
    }
  }

  return penalty;
}

function roadPenalty(road) {
  if (!road) return 18;
  if (road.level === "High") return 40;
  if (road.level === "Medium") return 22;
  return 8;
}

function buildOption(id, name, points, road, hotspots) {
  const distanceKm = routeDistance(points);
  const penalty = roadPenalty(road) + hotspotPenalty(points, hotspots);
  const score = Math.round(distanceKm * 6 + penalty);

  return {
    id,
    name,
    points,
    distanceKm,
    score,
    roadName: road?.name || "Direct road",
    roadLevel: road?.level || "Unknown",
    summary:
      road?.level === "Low"
        ? "Safer corridor with lower hotspot exposure."
        : road?.level === "Medium"
          ? "Balanced route with moderate road risk."
          : "Shortest option but more exposed to risky roads."
  };
}

export function planRiskAwareRoutes({ start, destination, center, roads = [], hotspots = [] }) {
  if (!start || !destination || !center) return null;

  const safestRoad = [...roads].sort((a, b) => a.score - b.score)[0];
  const balancedRoad =
    roads.find((road) => road.level === "Medium") || safestRoad || roads[0];
  const fastestRoad =
    [...roads].sort((a, b) => b.score - a.score).find((road) => road.level !== "Low") ||
    roads[0];

  const centerPoint = { lat: center[0], lon: center[1] };
  const safestPath = safestRoad
    ? [start, roadPoint(safestRoad.points[0]), roadPoint(safestRoad.points[1]), destination]
    : [start, centerPoint, destination];

  const balancedPath = balancedRoad
    ? [
        start,
        midpoint(roadPoint(balancedRoad.points[0]), centerPoint),
        roadPoint(balancedRoad.points[1]),
        destination
      ]
    : [start, centerPoint, destination];

  const options = [
    buildOption("safe", "Safer route", safestPath, safestRoad, hotspots),
    buildOption("balanced", "Balanced route", balancedPath, balancedRoad, hotspots),
    buildOption("direct", "Direct route", [start, destination], fastestRoad, hotspots)
  ].sort((a, b) => a.score - b.score);

  return {
    bestRouteId: options[0]?.id || null,
    options
  };
}
