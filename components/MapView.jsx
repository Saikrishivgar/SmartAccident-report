"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useMap } from "react-leaflet";

import { getCitySizing } from "@/lib/citySizing";
import { buildRoadOverlay } from "@/lib/mapOverlays";
import { aggregateZoneRisks } from "@/lib/zoneAggregator";
import { generateCityZones } from "@/lib/zoneGenerator";
import { buildZoneRiskProfile } from "@/lib/zoneRiskProfile";

const MapContainer = dynamic(
  () => import("react-leaflet").then((module) => module.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  { ssr: false }
);
const Circle = dynamic(
  () => import("react-leaflet").then((module) => module.Circle),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((module) => module.CircleMarker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((module) => module.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import("react-leaflet").then((module) => module.Polyline),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((module) => module.Tooltip),
  { ssr: false }
);

function riskColor(level) {
  if (level === "High") return "#ef4444";
  if (level === "Medium") return "#f59e0b";
  return "#22c55e";
}

function averageZoneMetric(zones, key) {
  if (!zones?.length) return 0;

  return Math.round(
    zones.reduce((sum, zone) => sum + (Number(zone[key]) || 0), 0) / zones.length
  );
}

function formatClock(value) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function MapAutoFit({ zones, hotspots, routePlan, selectedRouteId }) {
  const map = useMap();
  const routePoints = useMemo(
    () =>
      (routePlan?.options || [])
        .filter((option) => !selectedRouteId || option.id === selectedRouteId)
        .flatMap((option) =>
        option.points.map((point) => [point.lat, point.lon])
      ),
    [routePlan, selectedRouteId]
  );

  useEffect(() => {
    const points = [
      ...(zones || []).map((zone) => [zone.lat, zone.lon]),
      ...(hotspots || []).map((spot) => [spot.lat, spot.lon]),
      ...routePoints
    ];

    if (!points.length) return;

    map.fitBounds(points, {
      padding: [30, 30]
    });
  }, [map, zones, hotspots, routePoints]);

  return null;
}

export default function MapView({
  city,
  scenario,
  refreshKey,
  enabled = false,
  routePlan = null,
  selectedRouteId = null,
  onAnalysisStart,
  onAnalysisComplete,
  onAnalysisError
}) {
  const [center, setCenter] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  async function fetchZoneRisk(zone, cityName, insights) {
    let liveWeather = "clear";
    let liveTrafficCongestion = 0;

    try {
      const trafficResponse = await fetch("/api/traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: zone.lat, lon: zone.lon })
      });

      if (trafficResponse.ok) {
        const trafficJson = await trafficResponse.json();
        liveTrafficCongestion = trafficJson.congestion ?? liveTrafficCongestion;
      }
    } catch {}

    try {
      const weatherResponse = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: zone.lat, lon: zone.lon })
      });

      if (weatherResponse.ok) {
        const weatherJson = await weatherResponse.json();
        liveWeather = weatherJson.weather ?? liveWeather;
      }
    } catch {}

    let cityAccidentCount = 0;

    try {
      const newsResponse = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityName })
      });

      if (newsResponse.ok) {
        const newsJson = await newsResponse.json();
        cityAccidentCount = newsJson.count ?? cityAccidentCount;
      }
    } catch {}

    const zoneProfile = buildZoneRiskProfile({
      zone,
      liveTrafficCongestion,
      scenario,
      insights
    });
    const accidentCount = Math.min(
      zoneProfile.accidentCount + Math.min(cityAccidentCount, 2),
      12
    );

    const riskResponse = await fetch("/api/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weather: scenario.weather === "auto" ? liveWeather : scenario.weather,
        trafficCongestion: zoneProfile.trafficCongestion,
        accidentCount,
        roadType: scenario.roadType || zoneProfile.roadType,
        roadCondition: zoneProfile.roadCondition,
        speedLimit: zoneProfile.speedLimit,
        hour: scenario.hour,
        isWeekend: scenario.isWeekend,
        pastAccidents: zoneProfile.historicalAccidentLoad
      })
    });

    if (!riskResponse.ok) return null;

    const riskJson = await riskResponse.json();

    return {
      ...riskJson.output,
      liveWeather,
      trafficCongestion: zoneProfile.trafficCongestion,
      accidentCount,
      trafficLabel: zoneProfile.trafficLabel,
      hotspotPressure: zoneProfile.hotspotPressure,
      localAccidentSignal: zoneProfile.localAccidentSignal,
      nearbyHotspots: zoneProfile.nearbyHotspots,
      historicalAccidentLoad: zoneProfile.historicalAccidentLoad,
      roadCondition: zoneProfile.roadCondition,
      roadType: zoneProfile.roadType,
      speedLimit: zoneProfile.speedLimit,
      liveTrafficCongestion
    };
  }

  const runCityAnalysis = useEffectEvent(async () => {
    const input = city.trim();
    if (!enabled || !input) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    onAnalysisStart?.();

    try {
      const [geoRes, accidentsRes] = await Promise.all([
        fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: input })
        }),
        fetch("/api/accidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: input })
        })
      ]);

      if (!geoRes.ok) {
        throw new Error("City not found. Try a valid Indian city name.");
      }

      const geo = await geoRes.json();
      const accidentsJson = accidentsRes.ok ? await accidentsRes.json() : null;
      const insights = accidentsJson?.insights || null;
      const newCenter = [geo.lat, geo.lon];
      const { zoneOffset, circleRadius } = getCitySizing(geo.bbox);
      const zones = generateCityZones(geo.lat, geo.lon, zoneOffset, geo.bbox);

      setCenter(newCenter);

      const zoneResults = (
        await Promise.all(
          zones.map(async (zone) => {
            const result = await fetchZoneRisk(
              zone,
              input,
              insights
            );

            return result
              ? {
                  ...zone,
                  ...result
                }
              : null;
          })
        )
      ).filter(Boolean);

      const aggregated = aggregateZoneRisks(zoneResults);
      const summary = {
        city: input,
        zones: zoneResults,
        aggregated,
        circleRadius,
        insights,
        roads: buildRoadOverlay(newCenter, zoneResults, insights)
      };

      if (requestId !== requestIdRef.current) return;
      setRiskData(summary);
      onAnalysisComplete?.(summary);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setRiskData(null);
      onAnalysisError?.(error.message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  });

  useEffect(() => {
    runCityAnalysis();
  }, [enabled, refreshKey]);

  return (
    <section className="basicPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Spatial Intelligence</p>
          <h2>City Risk Map</h2>
          <p className="sectionText">See all generated city zones on the map.</p>
        </div>
        {loading ? <span className="pill pillWarning">Refreshing zones</span> : null}
      </div>

      {riskData?.zones?.length ? (
        <div className="mapCommandGrid">
          <article className="mapCommandCard">
            <span>City score</span>
            <strong>{riskData.aggregated.cityRiskScore}</strong>
            <p>Highest zone score detected across the active city model.</p>
          </article>
          <article className="mapCommandCard">
            <span>Average traffic</span>
            <strong>{averageZoneMetric(riskData.zones, "trafficCongestion")}%</strong>
            <p>Mean congestion across all mapped sectors.</p>
          </article>
          <article className="mapCommandCard">
            <span>Hotspots tracked</span>
            <strong>{riskData.insights?.hotspotPoints?.length || 0}</strong>
            <p>Historical accident markers overlaid into live zone analysis.</p>
          </article>
          <article className="mapCommandCard">
            <span>Zone spread</span>
            <strong>
              {riskData.aggregated.minRiskScore} to {riskData.aggregated.cityRiskScore}
            </strong>
            <p>How far the city shifts between safer and riskier sectors.</p>
          </article>
        </div>
      ) : null}

      <div className="mapFrame">
        {riskData?.zones?.length ? (
          <div className="mapHud">
            <div className="mapHudGroup">
              <span className="mapHudLabel">Live city</span>
              <strong>{riskData.city}</strong>
            </div>
            <div className="mapHudGroup">
              <span className="mapHudLabel">Conditions</span>
              <strong>{scenario.isWeekend ? "Weekend" : "Weekday"} • {scenario.hour}:00</strong>
            </div>
            <div className="mapHudGroup">
              <span className="mapHudLabel">Avg load</span>
              <strong>{averageZoneMetric(riskData.zones, "trafficCongestion")}% traffic</strong>
            </div>
            <div className="mapHudGroup">
              <span className="mapHudLabel">Live time</span>
              <strong>{formatClock(now)}</strong>
            </div>
          </div>
        ) : null}

        {enabled && center ? (
          <MapContainer
            key={`${center[0]}-${center[1]}`}
            center={center}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
          >
            <MapAutoFit
              zones={riskData?.zones}
              hotspots={riskData?.insights?.hotspotPoints}
              routePlan={routePlan}
              selectedRouteId={selectedRouteId}
            />
            <TileLayer
              attribution="© OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {riskData?.roads?.map((road) => (
              <Polyline
                key={road.id}
                positions={road.points}
                pathOptions={{
                  color: road.color,
                  weight: road.level === "High" ? 8 : road.level === "Medium" ? 6 : 4,
                  opacity: 0.92
                }}
              >
                <Tooltip sticky>
                  {road.name}
                  <br />
                  Alert level: {road.level}
                  <br />
                  Road risk score: {road.score}
                </Tooltip>
              </Polyline>
            ))}

            {riskData?.zones?.map((zone) => (
              <Circle
                key={`${zone.name}-${zone.lat}-${zone.lon}`}
                center={[zone.lat, zone.lon]}
                radius={riskData.circleRadius}
                pathOptions={{
                  color: riskColor(zone.riskLevel),
                  fillColor: riskColor(zone.riskLevel),
                  fillOpacity: 0.35
                }}
              >
                <Popup>
                  <strong>{zone.name}</strong>
                  <br />
                  Risk: {zone.riskLevel} ({zone.riskScore})
                  <br />
                  Weather: {zone.liveWeather}
                  <br />
                  Traffic: {zone.trafficCongestion}%
                  <br />
                  Incident signal: {zone.accidentCount}
                </Popup>
              </Circle>
            ))}

            {riskData?.insights?.hotspotPoints?.map((spot) => (
              <CircleMarker
                key={spot.id}
                center={[spot.lat, spot.lon]}
                radius={Math.min(14, Math.max(6, 4 + spot.hazardScore / 3))}
                pathOptions={{
                  color:
                    spot.severity === "Fatal"
                      ? "#ef4444"
                      : spot.severity === "Serious"
                        ? "#f59e0b"
                        : "#38bdf8",
                  fillColor:
                    spot.severity === "Fatal"
                      ? "#ef4444"
                      : spot.severity === "Serious"
                        ? "#f59e0b"
                        : "#38bdf8",
                  fillOpacity: 0.85,
                  weight: 1
                }}
              >
                <Popup>
                  Accident hotspot
                  <br />
                  Severity: {spot.severity}
                  <br />
                  Weather: {spot.weather}
                  <br />
                  Road: {spot.roadType}
                  <br />
                  Casualties: {spot.casualties}, Fatalities: {spot.fatalities}
                </Popup>
              </CircleMarker>
            ))}

            {routePlan?.options?.map((option) => (
              <Polyline
                key={option.id}
                positions={option.points.map((point) => [point.lat, point.lon])}
                pathOptions={{
                  color: selectedRouteId === option.id ? "#38bdf8" : "#cbd5e1",
                  weight: selectedRouteId === option.id ? 7 : 3,
                  dashArray: selectedRouteId === option.id ? undefined : "10 8",
                  opacity: selectedRouteId === option.id ? 0.95 : 0.45
                }}
              >
                <Popup>
                  {option.name}
                  <br />
                  Distance: {option.distanceKm} km
                  <br />
                  ETA: {option.durationMin ? `${option.durationMin} min` : "--"}
                  <br />
                  Arrival: {option.durationMin
                    ? formatClock(new Date(now.getTime() + option.durationMin * 60000))
                    : "--"}
                  <br />
                  Route score: {option.score}
                  <br />
                  Corridor: {option.roadName}
                </Popup>
              </Polyline>
            ))}

            {routePlan?.options
              ?.filter((option) => option.id === selectedRouteId)
              .flatMap((option) =>
              option.points.map((point, index) => (
                <CircleMarker
                  key={`${option.id}-${index}-${point.lat}-${point.lon}`}
                  center={[point.lat, point.lon]}
                  radius={6}
                  pathOptions={{
                    color: "#38bdf8",
                    fillColor: "#38bdf8",
                    fillOpacity: 0.9
                  }}
                >
                  <Tooltip permanent={index === 0 || index === option.points.length - 1} direction="top">
                    {index === 0
                      ? "Start"
                      : index === option.points.length - 1
                        ? "Destination"
                        : option.name}
                  </Tooltip>
                </CircleMarker>
              ))
            )}
          </MapContainer>
        ) : (
          <div className="emptyMapState">
            <h4>Run analysis to load the map</h4>
            <p>The map will display center, north, south, east, and west zones.</p>
          </div>
        )}
      </div>

      {riskData?.zones?.length ? (
        <>
          <div className="mapLegend">
            <span><i className="legendSwatch legendHigh" /> High-risk road</span>
            <span><i className="legendSwatch legendMedium" /> Medium-risk road</span>
            <span><i className="legendSwatch legendLow" /> Lower-risk road</span>
            <span><i className="legendDot legendHotspot" /> Accident hotspot</span>
          </div>

          <div className="zoneGrid">
          {riskData.zones.map((zone) => (
            <article className="zoneCard" key={`${zone.name}-${zone.lat}-${zone.lon}-card`}>
              <div className="zoneTitleRow">
                <div className="zoneIdentity">
                  <h4>{zone.name}</h4>
                  <span className="zoneMicroMeta">{zone.roadType}</span>
                </div>
                <span
                  className="pill"
                  style={{
                    background: `${riskColor(zone.riskLevel)}22`,
                    color: riskColor(zone.riskLevel)
                  }}
                >
                  {zone.riskLevel}
                </span>
              </div>
              <div className="zoneMetricRow">
                <div className="zoneMetricPill">
                  <span>Score</span>
                  <strong>{zone.riskScore}</strong>
                </div>
                <div className="zoneMetricPill">
                  <span>Traffic</span>
                  <strong>{zone.trafficCongestion}%</strong>
                </div>
                <div className="zoneMetricPill">
                  <span>History</span>
                  <strong>{zone.historicalAccidentLoad}</strong>
                </div>
              </div>
              <p>
                {zone.trafficLabel} traffic, {zone.localAccidentSignal} nearby hotspot
                {zone.localAccidentSignal === 1 ? "" : "s"}, and {zone.roadCondition} road
                conditions.
              </p>
            </article>
          ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
