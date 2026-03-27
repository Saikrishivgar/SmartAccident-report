"use client";

import { useEffect, useState } from "react";

import MapView from "@/components/MapView";
import SafetyNotifier from "@/components/SafetyNotifier";
import { buildRiskReport } from "@/lib/reportGenerator";
import { planRiskAwareRoutes } from "@/lib/routePlanner";

const defaultScenario = {
  weather: "auto",
  hour: 21,
  roadType: "national highway",
  isWeekend: false
};

function levelClass(level) {
  if (level === "High") return "statusHigh";
  if (level === "Medium") return "statusMedium";
  return "statusLow";
}

function formatClock(value) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

export default function RiskWorkbench() {
  const [city, setCity] = useState("Chennai");
  const [scenario, setScenario] = useState(defaultScenario);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [summary, setSummary] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [routeForm, setRouteForm] = useState({
    start: "Chennai Central",
    destination: "Marina Beach"
  });
  const [routePlan, setRoutePlan] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  async function runAssessment() {
    const normalizedCity = city.trim();
    if (!normalizedCity) return;

    setError("");
    setLoading(true);
    setRoutePlan(null);
    setSelectedRouteId(null);

    try {
      const accidentsRes = await fetch("/api/accidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: normalizedCity })
      });

      const accidentsJson = accidentsRes.ok ? await accidentsRes.json() : null;
      const insights = accidentsJson?.insights || null;

      const riskRes = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...scenario,
          weather:
            scenario.weather === "auto"
              ? insights?.dominantWeather?.toLowerCase() || "clear"
              : scenario.weather,
          roadType:
            scenario.roadType || insights?.dominantRoadType?.toLowerCase() || "urban road",
          roadCondition:
            insights?.dominantRoadCondition?.toLowerCase() || "dry",
          speedLimit: insights?.avgSpeedLimit || 60,
          pastAccidents: insights?.totalAccidents || 0,
          accidentCount: insights ? Math.round(insights.fatalRate / 20) : 0
        })
      });

      const riskJson = await riskRes.json();

      setAssessment({
        ...riskJson.output,
        city: normalizedCity,
        insights,
        reports: buildRiskReport(riskJson.output, insights, summary?.roads || [])
      });
      setHasRunAnalysis(true);
      setRefreshKey((value) => value + 1);
    } catch {
      setError("Unable to analyze the selected scenario right now.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setScenario((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateRouteField(field, value) {
    setRouteForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function planRoute() {
    if (!summary || !routeForm.start.trim() || !routeForm.destination.trim()) return;

    setRouteLoading(true);
    setError("");

    try {
      const [startRes, destinationRes] = await Promise.all([
        fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: routeForm.start })
        }),
        fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: routeForm.destination })
        })
      ]);

      if (!startRes.ok || !destinationRes.ok) {
        throw new Error("Unable to locate the start or destination.");
      }

      const startGeo = await startRes.json();
      const destinationGeo = await destinationRes.json();
      const routePayload = {
        start: { lat: startGeo.lat, lon: startGeo.lon },
        destination: { lat: destinationGeo.lat, lon: destinationGeo.lon },
        center: summary.zones?.[0]
          ? [summary.zones[0].lat, summary.zones[0].lon]
          : null,
        roads: summary.roads || [],
        hotspots: summary.insights?.hotspotPoints || []
      };
      const routedRes = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routePayload)
      });

      const planned = routedRes.ok
        ? await routedRes.json()
        : planRiskAwareRoutes(routePayload);

      setRoutePlan(planned);
      setSelectedRouteId(planned?.bestRouteId || null);
    } catch (routeError) {
      setError(routeError.message || "Unable to build a safer route.");
    } finally {
      setRouteLoading(false);
    }
  }

  function exportCsv() {
    if (!assessment || !summary) return;

    const rows = [
      ["Metric", "Value"],
      ["City", city],
      ["Risk Level", assessment.riskLevel],
      ["Risk Score", assessment.riskScore],
      ["Road Condition", summary.insights?.dominantRoadCondition || ""],
      ["Average Speed Limit", summary.insights?.avgSpeedLimit || ""],
      ["Historical Cases", summary.insights?.totalAccidents || 0],
      ["Dominant Weather", summary.insights?.dominantWeather || ""],
      ...summary.roads.map((road) => [
        `Road Corridor: ${road.name}`,
        `${road.level} (${road.score})`
      ])
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${city.toLowerCase().replace(/\s+/g, "-")}-risk-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!assessment || !summary) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    const reportHtml = `
      <html>
        <head>
          <title>${city} Risk Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1, h2 { margin-bottom: 12px; }
            .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
            ul { margin: 8px 0 0 20px; }
          </style>
        </head>
        <body>
          <h1>${city} Accident Risk Report</h1>
          <div class="card">
            <h2>Analysis Summary</h2>
            <p>Risk Level: ${assessment.riskLevel}</p>
            <p>Risk Score: ${assessment.riskScore}/100</p>
            <p>Dominant Weather: ${summary.insights?.dominantWeather || "-"}</p>
            <p>Road Condition: ${summary.insights?.dominantRoadCondition || "-"}</p>
            <p>Average Speed Limit: ${summary.insights?.avgSpeedLimit || "-"} km/h</p>
          </div>
          <div class="card">
            <h2>Recommendations</h2>
            <ul>${assessment.recommendations.map((tip) => `<li>${tip}</li>`).join("")}</ul>
          </div>
          <div class="card">
            <h2>Road Corridors</h2>
            <ul>${(summary.roads || []).map((road) => `<li>${road.name}: ${road.level} (${road.score})</li>`).join("")}</ul>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(reportHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <div className="simplePage">
      <section className="workspaceHero">
        <div className="workspaceHeroCopy">
          <p className="eyebrow">Urban Safety Intelligence</p>
          <h1>Smart Accident Risk Prediction</h1>
          <p>
            Analyze city traffic exposure, hotspot density, and route safety from one
            premium control surface built for real operations teams.
          </p>
        </div>

        <div className="heroMetrics">
          <article className="heroMetricCard">
            <span>Live zone model</span>
            <strong>{summary?.zones?.length || 5} sectors</strong>
            <p>Center, north, south, east, and west risk mapping.</p>
          </article>
          <article className="heroMetricCard">
            <span>Route intelligence</span>
            <strong>{routePlan?.options?.length || 3} options</strong>
            <p>Compare safer corridors before highlighting on the map.</p>
          </article>
          <article className="heroMetricCard">
            <span>Current scenario</span>
            <strong>{city}</strong>
            <p>
              {scenario.weather === "auto" ? "Auto weather" : scenario.weather},{" "}
              {scenario.hour}:00, {scenario.isWeekend ? "weekend" : "weekday"}.
            </p>
          </article>
        </div>
      </section>

      <section className="basicPanel commandPanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Control Surface</p>
            <h2>Risk Analysis Setup</h2>
            <p className="sectionText">
              Configure the city, environment, and road context before running analysis.
            </p>
          </div>
        </div>

        <div className="basicForm">
          <label className="field">
            <span>City</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Chennai"
            />
          </label>

          <label className="field">
            <span>Weather</span>
            <select
              value={scenario.weather}
              onChange={(event) => updateField("weather", event.target.value)}
            >
              <option value="auto">Auto</option>
              <option value="clear">Clear</option>
              <option value="rain">Rain</option>
              <option value="fog">Fog</option>
              <option value="storm">Storm</option>
              <option value="hazy">Hazy</option>
            </select>
          </label>

          <label className="field">
            <span>Hour</span>
            <input
              type="number"
              min="0"
              max="23"
              value={scenario.hour}
              onChange={(event) => updateField("hour", Number(event.target.value))}
            />
          </label>

          <label className="field">
            <span>Road Type</span>
            <select
              value={scenario.roadType}
              onChange={(event) => updateField("roadType", event.target.value)}
            >
              <option value="urban road">Urban road</option>
              <option value="village road">Village road</option>
              <option value="state highway">State highway</option>
              <option value="national highway">National highway</option>
            </select>
          </label>

          <label className="checkboxField">
            <input
              type="checkbox"
              checked={scenario.isWeekend}
              onChange={(event) => updateField("isWeekend", event.target.checked)}
            />
            <span>Weekend traffic</span>
          </label>

          <button
            className="primaryButton"
            type="button"
            onClick={runAssessment}
            disabled={loading}
          >
            {loading ? "Loading..." : "Check Risk"}
          </button>
        </div>

        {error ? <p className="errorText">{error}</p> : null}

        {assessment ? (
          <div className="summaryGrid">
            <div className="summaryCard">
              <span>Risk Level</span>
              <strong className={levelClass(assessment.riskLevel)}>
                {assessment.riskLevel}
              </strong>
            </div>
            <div className="summaryCard">
              <span>Risk Score</span>
              <strong>{assessment.riskScore}/100</strong>
            </div>
            <div className="summaryCard">
              <span>Historical Cases</span>
              <strong>{assessment.insights?.totalAccidents ?? "--"}</strong>
            </div>
            <div className="summaryCard">
              <span>Avg Casualties</span>
              <strong>{assessment.insights?.avgCasualties ?? "--"}</strong>
            </div>
            <div className="summaryCard">
              <span>Road Condition</span>
              <strong>{assessment.insights?.dominantRoadCondition ?? "--"}</strong>
            </div>
            <div className="summaryCard">
              <span>Speed Limit</span>
              <strong>{assessment.insights?.avgSpeedLimit ? `${assessment.insights.avgSpeedLimit} km/h` : "--"}</strong>
            </div>
          </div>
        ) : null}

        {assessment ? (
          <div className="twoColumnInfo">
            <div className="simpleListCard">
              <h3>Main Factors</h3>
              <ul>
                {assessment.topFactors.map((factor) => (
                  <li key={factor.label}>
                    {factor.label}: {factor.score}
                  </li>
                ))}
              </ul>
            </div>

            <div className="simpleListCard">
              <h3>Suggestions</h3>
              <ul>
                {assessment.recommendations.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {summary?.roads?.length && assessment ? (
          <div className="reportGrid">
            {buildRiskReport(assessment, summary.insights, summary.roads).map((report) => (
              <article className="summaryCard reportCard" key={report.title}>
                <span>{report.title}</span>
                <strong className={levelClass(report.tone)}>{report.tone} alert</strong>
                <p>{report.body}</p>
              </article>
            ))}
          </div>
        ) : null}

        {assessment ? (
          <div className="actionRow">
            <button className="primaryButton" type="button" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="secondaryButton" type="button" onClick={exportPdf}>
              Export PDF
            </button>
          </div>
        ) : null}
      </section>

      <MapView
        city={city}
        scenario={scenario}
        refreshKey={refreshKey}
        enabled={hasRunAnalysis}
        routePlan={routePlan}
        selectedRouteId={selectedRouteId}
        onAnalysisStart={() => setError("")}
        onAnalysisComplete={setSummary}
        onAnalysisError={setError}
      />

      {summary?.insights ? (
        <>
          <section className="basicPanel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Navigation Layer</p>
                <h2>Route Tracking</h2>
                <p className="sectionText">
                  Enter a start and destination to compare safer route options.
                </p>
              </div>
            </div>

            <div className="routePlannerGrid">
              <label className="field">
                <span>Start</span>
                <input
                  value={routeForm.start}
                  onChange={(event) => updateRouteField("start", event.target.value)}
                  placeholder="Chennai Central"
                />
              </label>

              <label className="field">
                <span>Destination</span>
                <input
                  value={routeForm.destination}
                  onChange={(event) => updateRouteField("destination", event.target.value)}
                  placeholder="Marina Beach"
                />
              </label>

              <button className="primaryButton" type="button" onClick={planRoute} disabled={routeLoading}>
                {routeLoading ? "Checking..." : "Find Best Route"}
              </button>
            </div>

            {routePlan?.options?.length ? (
              <div className="reportGrid">
                {routePlan.options.map((option) => (
                  <article
                    className={`summaryCard reportCard routeOptionCard ${
                      selectedRouteId === option.id ? "routeOptionSelected" : ""
                    }`}
                    key={option.id}
                  >
                    <span>{option.name}</span>
                    <strong className={routePlan.bestRouteId === option.id ? "statusLow" : ""}>
                      {option.distanceKm} km
                    </strong>
                    <p>{option.summary}</p>
                    <p>Road used: {option.roadName}</p>
                    <p>Route score: {option.score}</p>
                    <p>ETA: {option.durationMin ? `${option.durationMin} min` : "--"}</p>
                    <p>
                      Arrival: {option.durationMin
                        ? formatClock(new Date(now.getTime() + option.durationMin * 60000))
                        : "--"}
                    </p>
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => setSelectedRouteId(option.id)}
                    >
                      {selectedRouteId === option.id ? "Highlighted on map" : "Show on map"}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="basicPanel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Dataset Snapshot</p>
                <h2>City Dataset Summary</h2>
              </div>
            </div>
            <div className="summaryGrid">
              <div className="summaryCard">
                <span>Common Road Type</span>
                <strong>{summary.insights.dominantRoadType}</strong>
              </div>
              <div className="summaryCard">
                <span>Common Weather</span>
                <strong>{summary.insights.dominantWeather}</strong>
              </div>
              <div className="summaryCard">
                <span>Night Cases</span>
                <strong>{summary.insights.nightAccidents}</strong>
              </div>
              <div className="summaryCard">
                <span>Peak Cases</span>
                <strong>{summary.insights.peakAccidents}</strong>
              </div>
            </div>
          </section>

          <SafetyNotifier
            city={city}
            hotspots={summary.insights.hotspotPoints}
            roads={summary.roads || []}
          />
        </>
      ) : null}
    </div>
  );
}
