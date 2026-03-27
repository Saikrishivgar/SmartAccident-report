"use client";

import { useEffect, useState } from "react";

const watchScenarios = [
  {
    title: "Night highway watch",
    payload: {
      weather: "fog",
      hour: 23,
      trafficCongestion: 52,
      roadType: "national highway",
      roadCondition: "wet",
      speedLimit: 90,
      pastAccidents: 18,
      accidentCount: 3,
      isWeekend: false
    }
  },
  {
    title: "Peak-hour metro traffic",
    payload: {
      weather: "rain",
      hour: 18,
      trafficCongestion: 74,
      roadType: "urban road",
      roadCondition: "wet",
      speedLimit: 60,
      pastAccidents: 24,
      accidentCount: 2,
      isWeekend: false
    }
  },
  {
    title: "Weekend local commute",
    payload: {
      weather: "clear",
      hour: 11,
      trafficCongestion: 18,
      roadType: "state highway",
      roadCondition: "dry",
      speedLimit: 50,
      pastAccidents: 8,
      accidentCount: 0,
      isWeekend: true
    }
  }
];

export default function AlertsCenter() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    async function load() {
      const responses = await Promise.all(
        watchScenarios.map(async (scenario) => {
          const res = await fetch("/api/risk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(scenario.payload)
          });

          const json = await res.json();
          return {
            title: scenario.title,
            ...json.output
          };
        })
      );

      setResults(responses);
    }

    load();
  }, []);

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Alert Center</p>
          <h2>Prebuilt watch scenarios</h2>
        </div>
      </div>

      <div className="alertList">
        {results.map((result) => (
          <article className="alertCard" key={result.title}>
            <div className="zoneTitleRow">
              <h3>{result.title}</h3>
              <span className={`pill status${result.riskLevel}`}>{result.riskLevel}</span>
            </div>
            <p>Score {result.riskScore}. Main contributors: {result.topFactors.map((item) => item.label).join(", ")}.</p>
          </article>
        ))}
      </div>
    </section>
  );
}
