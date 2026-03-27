function lineRiskLevel(score) {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function lineColor(level) {
  if (level === "High") return "#ef4444";
  if (level === "Medium") return "#f59e0b";
  return "#22c55e";
}

export function buildRoadOverlay(center, zones, insights) {
  if (!center || !zones?.length) return [];

  const centerZone =
    zones.find((zone) => zone.name === "Center") || zones[0];
  const nonCenterZones = zones.filter((zone) => zone !== centerZone);

  const radialRoads = nonCenterZones.map((zone, index) => {
    const adjustedScore = Math.min(
      100,
      zone.riskScore +
        (insights?.fatalRate || 0) * 0.15 +
        (insights?.nightAccidents || 0) * 0.04
    );
    const level = lineRiskLevel(adjustedScore);

    return {
      id: `radial-${zone.name}-${index}`,
      name: `${zone.name} corridor`,
      level,
      color: lineColor(level),
      score: Math.round(adjustedScore),
      points: [
        [centerZone.lat, centerZone.lon],
        [zone.lat, zone.lon]
      ]
    };
  });

  const ringRoads = [];

  for (let index = 0; index < nonCenterZones.length; index += 1) {
    const current = nonCenterZones[index];
    const next = nonCenterZones[(index + 1) % nonCenterZones.length];
    if (!current || !next) continue;

    const adjustedScore = Math.round((current.riskScore + next.riskScore) / 2);
    const level = lineRiskLevel(adjustedScore);

    ringRoads.push({
      id: `ring-${current.name}-${next.name}`,
      name: `${current.name} to ${next.name} link`,
      level,
      color: lineColor(level),
      score: adjustedScore,
      points: [
        [current.lat, current.lon],
        [next.lat, next.lon]
      ]
    });
  }

  return [...radialRoads, ...ringRoads];
}
