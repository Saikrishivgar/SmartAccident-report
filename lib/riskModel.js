function scoreBand(value, bands) {
  for (const band of bands) {
    if (value >= band.min) return band.score;
  }

  return 0;
}

function buildRecommendations(topFactors, weather, roadCondition, trafficCongestion) {
  const recommendations = [];

  if (weather === "fog" || weather === "storm") {
    recommendations.push("Enable low-beam lighting and reduce speed on low-visibility stretches.");
  }

  if (weather === "rain") {
    recommendations.push("Increase braking distance and avoid sudden lane changes on wet roads.");
  }

  if (roadCondition === "under construction" || roadCondition === "damaged") {
    recommendations.push("Flag this corridor for temporary signage, barriers, and reduced speed enforcement.");
  }

  if (trafficCongestion >= 60) {
    recommendations.push("Use congestion alerts or rerouting because stop-go traffic is strongly elevating risk.");
  }

  for (const factor of topFactors) {
    if (factor.label === "Historical Pattern") {
      recommendations.push("Historical accident frequency is high here, so treat this location as a monitored hotspot.");
    }

    if (factor.label === "Time Window") {
      recommendations.push("Night and peak-hour travel need extra caution because reaction time and conflict points increase.");
    }
  }

  return [...new Set(recommendations)].slice(0, 4);
}

export function predictAccidentRisk({
  weather = "clear",
  hour = new Date().getHours(),
  trafficCongestion = 20,
  roadType = "urban road",
  roadCondition = "dry",
  speedLimit = 60,
  pastAccidents = 0,
  accidentCount = 0,
  isWeekend = false
}) {
  const normalizedWeather = String(weather).toLowerCase();
  const normalizedRoadType = String(roadType).toLowerCase();
  const normalizedRoadCondition = String(roadCondition).toLowerCase();

  const weatherScoreMap = {
    clear: 4,
    cloudy: 6,
    hazy: 8,
    rain: 16,
    fog: 18,
    storm: 20
  };

  const roadTypeScoreMap = {
    "urban road": 8,
    "village road": 10,
    "state highway": 12,
    "national highway": 15,
    highway: 15
  };

  const roadConditionScoreMap = {
    dry: 3,
    wet: 9,
    damaged: 12,
    "under construction": 14
  };

  const historicalScore = Math.min(
    Math.round(Math.log1p(Number(pastAccidents) || 0) * 6),
    22
  );
  const breakingNewsScore = Math.min((Number(accidentCount) || 0) * 4, 16);
  const trafficScore = scoreBand(Number(trafficCongestion) || 0, [
    { min: 70, score: 18 },
    { min: 45, score: 13 },
    { min: 20, score: 8 },
    { min: 0, score: 4 }
  ]);

  const timeScore =
    hour >= 22 || hour <= 5 ? 16 : hour >= 17 && hour <= 21 ? 12 : hour >= 7 && hour <= 10 ? 10 : 5;

  const speedScore = scoreBand(Number(speedLimit) || 0, [
    { min: 100, score: 14 },
    { min: 80, score: 10 },
    { min: 60, score: 7 },
    { min: 0, score: 4 }
  ]);

  const breakdown = [
    { label: "Weather", score: weatherScoreMap[normalizedWeather] ?? 5 },
    { label: "Time Window", score: timeScore },
    { label: "Traffic Load", score: trafficScore },
    { label: "Road Type", score: roadTypeScoreMap[normalizedRoadType] ?? 9 },
    {
      label: "Road Condition",
      score: roadConditionScoreMap[normalizedRoadCondition] ?? 6
    },
    { label: "Speed Limit", score: speedScore },
    { label: "Historical Pattern", score: historicalScore },
    { label: "Recent Incident Signal", score: breakingNewsScore },
    { label: "Weekend Effect", score: isWeekend ? 4 : 0 }
  ];

  const rawScore = breakdown.reduce((sum, item) => sum + item.score, 0);
  const riskScore = Math.max(0, Math.min(Math.round(rawScore), 100));

  let riskLevel = "Low";
  if (riskScore >= 70) riskLevel = "High";
  else if (riskScore >= 40) riskLevel = "Medium";

  const topFactors = [...breakdown]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    riskScore,
    riskLevel,
    confidence: pastAccidents > 0 ? "Dataset-backed" : "Heuristic",
    breakdown,
    topFactors,
    recommendations: buildRecommendations(
      topFactors,
      normalizedWeather,
      normalizedRoadCondition,
      Number(trafficCongestion) || 0
    )
  };
}
