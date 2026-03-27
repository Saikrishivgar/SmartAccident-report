function formatRoadLabel(value) {
  return value || "Urban road";
}

export function buildRiskReport(assessment, insights, roads = []) {
  if (!assessment || !insights) return [];

  const highRoads = roads.filter((road) => road.level === "High").slice(0, 3);
  const topHotspots = (insights.hotspotPoints || [])
    .slice(0, 3)
    .map((spot) => `${spot.roadType} (${spot.severity}, ${spot.weather})`);

  const report = [
    {
      title: "Road condition report",
      tone: assessment.riskLevel,
      body: `This area trends risky when ${insights.dominantRoadCondition.toLowerCase()} roads and ${insights.dominantWeather.toLowerCase()} weather appear together. Drivers usually do not know this before entering, so the app should surface this automatically.`
    },
    {
      title: "Pattern report",
      tone: assessment.riskLevel,
      body: `${insights.totalAccidents} accident records were matched for this profile. The strongest repeating road type is ${formatRoadLabel(insights.dominantRoadType)}, and ${insights.nightAccidents} cases happened during night-risk hours.`
    },
    {
      title: "Hotspot report",
      tone: highRoads.length ? "High" : assessment.riskLevel,
      body: highRoads.length
        ? `Highest alert corridors right now: ${highRoads.map((road) => road.name).join(", ")}. These should be shown in red on the map so users know to slow down before entering.`
        : `Top accident hotspots in this city profile include ${topHotspots.join(", ") || "historical crash clusters"} and should stay visible on the map.`
    }
  ];

  if (assessment.riskLevel === "High") {
    report.push({
      title: "Driver advisory",
      tone: "High",
      body: "Issue a slow-down advisory for mobile users entering this corridor, especially in rain, fog, damaged roads, and late-night travel."
    });
  }

  return report;
}
