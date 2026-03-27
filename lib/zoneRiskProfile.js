function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInKm(from, to) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getBaselineTraffic(hour, isWeekend) {
  if (isWeekend) {
    if (hour >= 11 && hour <= 14) return 30;
    if (hour >= 18 && hour <= 21) return 36;
    return 20;
  }

  if (hour >= 8 && hour <= 11) return 58;
  if (hour >= 17 && hour <= 21) return 64;
  if (hour >= 12 && hour <= 16) return 42;
  return 24;
}

function getDirectionalBias(zoneName, hour, isWeekend) {
  const morning = hour >= 7 && hour <= 11;
  const evening = hour >= 17 && hour <= 21;

  switch (zoneName) {
    case "Center":
      return morning || evening ? 10 : 6;
    case "North":
      return morning ? 9 : evening ? 4 : 3;
    case "South":
      return evening ? 10 : morning ? 5 : 4;
    case "East":
      return morning ? 8 : evening ? 5 : 3;
    case "West":
      return evening ? 9 : morning ? 4 : 3;
    default:
      return isWeekend ? 2 : 4;
  }
}

function getHotspotRadius(zoneName) {
  if (zoneName === "Center") return 4.5;
  return 5.5;
}

function getLocalHotspotProfile(zone, hotspots = []) {
  const hotspotRadius = getHotspotRadius(zone.name);

  const nearbyHotspots = hotspots
    .map((spot) => {
      const distanceKm = distanceInKm(zone, spot);
      return {
        ...spot,
        distanceKm
      };
    })
    .filter((spot) => spot.distanceKm <= hotspotRadius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 4);

  const hotspotPressure = nearbyHotspots.reduce((sum, spot) => {
    const distanceWeight = clamp(1 - spot.distanceKm / hotspotRadius, 0.2, 1);
    return sum + spot.hazardScore * distanceWeight;
  }, 0);

  return {
    nearbyHotspots,
    hotspotPressure: Math.round(hotspotPressure),
    localAccidentSignal: nearbyHotspots.length
  };
}

export function buildZoneRiskProfile({
  zone,
  liveTrafficCongestion = 0,
  scenario,
  insights
}) {
  const baselineTraffic = getBaselineTraffic(scenario.hour, scenario.isWeekend);
  const directionalBias = getDirectionalBias(
    zone.name,
    scenario.hour,
    scenario.isWeekend
  );
  const { nearbyHotspots, hotspotPressure, localAccidentSignal } =
    getLocalHotspotProfile(zone, insights?.hotspotPoints);

  const trafficSeed =
    liveTrafficCongestion > 0
      ? Math.round(liveTrafficCongestion * 0.7 + baselineTraffic * 0.3)
      : baselineTraffic;

  const hotspotTrafficLift = Math.min(10, Math.round(hotspotPressure / 10));
  const trafficCongestion = clamp(
    trafficSeed + directionalBias + hotspotTrafficLift,
    8,
    88
  );

  const roadCondition =
    hotspotPressure >= 22
      ? "damaged"
      : hotspotPressure >= 10
        ? "wet"
        : insights?.dominantRoadCondition?.toLowerCase() || "dry";

  const roadType =
    zone.name === "Center"
      ? "urban road"
      : zone.name === "East" || zone.name === "West"
        ? "state highway"
        : insights?.dominantRoadType?.toLowerCase() || "urban road";

  const speedLimit = clamp(
    (insights?.avgSpeedLimit || 60) +
      (zone.name === "East" || zone.name === "West" ? 8 : 0) -
      (zone.name === "Center" ? 10 : 0),
    35,
    100
  );

  const accidentCount = clamp(
    (localAccidentSignal || 0) + Math.round(hotspotPressure / 16),
    0,
    6
  );
  const totalAccidents = Number(insights?.totalAccidents) || 0;
  const historicalAccidentLoad = totalAccidents
    ? clamp(
        Math.round(
          totalAccidents *
            clamp(0.05 + hotspotPressure / 220 + localAccidentSignal / 30, 0.03, 0.2)
        ),
        0,
        totalAccidents
      )
    : 0;

  const trafficLabel =
    trafficCongestion >= 70
      ? "Heavy"
      : trafficCongestion >= 45
        ? "Moderate"
        : "Light";

  return {
    trafficCongestion,
    roadCondition,
    roadType,
    speedLimit,
    accidentCount,
    historicalAccidentLoad,
    hotspotPressure,
    localAccidentSignal,
    nearbyHotspots,
    trafficLabel
  };
}
