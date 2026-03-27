import { loadAccidentData } from "@/lib/dataParser";

const cityAliases = {
  bengaluru: "bangalore",
  bombay: "mumbai",
  madras: "chennai",
  delhi: "new delhi"
};

function normalize(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return cityAliases[normalized] || normalized;
}

function titleCase(value) {
  if (!value) return "Unknown";

  return String(value)
    .split(/[\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function increment(map, key) {
  const safeKey = key || "Unknown";
  map.set(safeKey, (map.get(safeKey) || 0) + 1);
}

function topEntries(map, limit = 3) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function getCityRows(rows, city) {
  const normalizedCity = normalize(city);
  return rows.filter((row) => normalize(row["City Name"]) === normalizedCity);
}

export function getCityGeoProfile(city) {
  const rows = loadAccidentData();
  const cityRows = getCityRows(rows, city);
  const dataset = cityRows.length ? cityRows : rows;

  const coords = dataset
    .map((row) => ({
      lat: Number(row.latitude),
      lon: Number(row.longitude)
    }))
    .filter((point) => !Number.isNaN(point.lat) && !Number.isNaN(point.lon));

  if (!coords.length) return null;

  const latitudes = coords.map((point) => point.lat);
  const longitudes = coords.map((point) => point.lon);
  const avgLat =
    latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
  const avgLon =
    longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length;

  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const latPad = Math.max((north - south) * 0.35, 0.08);
  const lonPad = Math.max((east - west) * 0.35, 0.08);

  return {
    matchedCity: cityRows.length > 0,
    lat: Number(avgLat.toFixed(6)),
    lon: Number(avgLon.toFixed(6)),
    bbox: [
      Number((south - latPad).toFixed(6)),
      Number((north + latPad).toFixed(6)),
      Number((west - lonPad).toFixed(6)),
      Number((east + lonPad).toFixed(6))
    ]
  };
}

export function getCityAccidentInsights(city) {
  const rows = loadAccidentData();
  const cityRows = getCityRows(rows, city);
  const dataset = cityRows.length > 0 ? cityRows : rows;

  const weatherCounts = new Map();
  const roadTypeCounts = new Map();
  const roadConditionCounts = new Map();
  const severityCounts = new Map();
  const riskyHours = [];

  let fatalCases = 0;
  let casualtyTotal = 0;
  let avgSpeedSource = 0;
  let avgSpeedCount = 0;

  for (const row of dataset) {
    const severity = row["Accident Severity"] || "Unknown";
    const weather = row["Weather Conditions"] || "Unknown";
    const roadType = row["Road Type"] || "Unknown";
    const roadCondition = row["Road Condition"] || "Unknown";
    const casualties = Number(row["Number of Casualties"] || 0);
    const fatalities = Number(row["Number of Fatalities"] || 0);
    const speedLimit = Number(row["Speed Limit (km/h)"] || 0);
    const timeString = row["Time of Day"] || "";
    const hour = Number.parseInt(timeString.split(":")[0], 10);

    increment(weatherCounts, titleCase(weather));
    increment(roadTypeCounts, roadType);
    increment(roadConditionCounts, titleCase(roadCondition));
    increment(severityCounts, severity);

    if (!Number.isNaN(hour)) riskyHours.push(hour);

    casualtyTotal += casualties;
    fatalCases += fatalities > 0 ? 1 : 0;

    if (!Number.isNaN(speedLimit) && speedLimit > 0) {
      avgSpeedSource += speedLimit;
      avgSpeedCount += 1;
    }
  }

  const totalAccidents = dataset.length;
  const fatalRate = totalAccidents
    ? Math.round((fatalCases / totalAccidents) * 100)
    : 0;
  const avgCasualties = totalAccidents
    ? Number((casualtyTotal / totalAccidents).toFixed(1))
    : 0;
  const avgSpeedLimit = avgSpeedCount
    ? Math.round(avgSpeedSource / avgSpeedCount)
    : 60;

  const nightAccidents = riskyHours.filter(
    (hour) => hour >= 21 || hour <= 5
  ).length;
  const peakAccidents = riskyHours.filter(
    (hour) => (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)
  ).length;

  const dominantWeather = topEntries(weatherCounts, 1)[0]?.label || "Clear";
  const dominantRoadType =
    topEntries(roadTypeCounts, 1)[0]?.label || "Urban Road";
  const dominantRoadCondition =
    topEntries(roadConditionCounts, 1)[0]?.label || "Dry";

  const hotspotPoints = dataset
    .map((row, index) => {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      const casualties = Number(row["Number of Casualties"] || 0);
      const fatalities = Number(row["Number of Fatalities"] || 0);
      const severity = row["Accident Severity"] || "Unknown";

      if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

      return {
        id: `${normalize(row["City Name"])}-${index}`,
        lat,
        lon,
        severity,
        weather: titleCase(row["Weather Conditions"]),
        roadType: row["Road Type"] || "Unknown",
        roadCondition: titleCase(row["Road Condition"]),
        casualties,
        fatalities,
        hazardScore: casualties + fatalities * 3 + (severity === "Fatal" ? 8 : severity === "Serious" ? 5 : 2)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.hazardScore - a.hazardScore)
    .slice(0, 12);

  return {
    city: cityRows.length > 0 ? city : "India (fallback profile)",
    matchedCity: cityRows.length > 0,
    totalAccidents,
    fatalRate,
    avgCasualties,
    avgSpeedLimit,
    nightAccidents,
    peakAccidents,
    dominantWeather,
    dominantRoadType,
    dominantRoadCondition,
    topWeather: topEntries(weatherCounts),
    topRoadTypes: topEntries(roadTypeCounts),
    topRoadConditions: topEntries(roadConditionCounts),
    severityMix: topEntries(severityCounts, 5),
    hotspotPoints
  };
}
