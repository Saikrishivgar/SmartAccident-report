"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function nearestHotspot(position, hotspots = []) {
  if (!position || !hotspots.length) return null;

  return hotspots.reduce((closest, hotspot) => {
    const distance = haversineMeters(
      position.lat,
      position.lon,
      hotspot.lat,
      hotspot.lon
    );

    if (!closest || distance < closest.distance) {
      return {
        ...hotspot,
        distance
      };
    }

    return closest;
  }, null);
}

export default function SafetyNotifier({ city, hotspots = [], roads = [] }) {
  const [permissionState, setPermissionState] = useState("default");
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState("Enable mobile alert to warn users near risky roads.");
  const notifiedIdsRef = useRef(new Set());
  const watchIdRef = useRef(null);

  const nearest = useMemo(
    () => nearestHotspot(position, hotspots),
    [position, hotspots]
  );

  const handleProximityAlert = useEffectEvent((nextPosition) => {
    const nextNearest = nearestHotspot(nextPosition, hotspots);
    if (!nextNearest) return;

    const threshold = nextNearest.severity === "Fatal" ? 1500 : 1000;
    if (nextNearest.distance > threshold) return;
    if (notifiedIdsRef.current.has(nextNearest.id)) return;

    notifiedIdsRef.current.add(nextNearest.id);
    setStatus(
      `Slow down near ${city}. You are close to a ${nextNearest.severity.toLowerCase()} accident hotspot on ${nextNearest.roadType}.`
    );

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const roadAlert = roads.find((road) => road.level === "High");
      new Notification("Go slow: risky road ahead", {
        body: roadAlert
          ? `${roadAlert.name} is marked high risk. ${Math.round(nextNearest.distance)} m to hotspot.`
          : `${Math.round(nextNearest.distance)} m to a ${nextNearest.severity.toLowerCase()} hotspot.`
      });
    }
  });

  async function enableAlerts() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("Geolocation is not available on this device.");
      return;
    }

    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
    } else {
      setPermissionState("unsupported");
    }

    setWatchEnabled(true);
    setStatus("Live location alert is active. Move near a risky road or hotspot to test.");
  }

  useEffect(() => {
    if (!watchEnabled || typeof window === "undefined" || !("geolocation" in navigator)) {
      return undefined;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geo) => {
        const nextPosition = {
          lat: geo.coords.latitude,
          lon: geo.coords.longitude
        };

        setPosition(nextPosition);
        handleProximityAlert(nextPosition);
      },
      () => {
        setStatus("Location access was denied. Allow location to get slow-down alerts.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [watchEnabled]);

  return (
    <section className="basicPanel">
      <div className="panelHeader">
        <div>
          <h2>Mobile Safety Alert</h2>
          <p className="sectionText">
            Browser-based slow-down warning for users entering risky areas.
          </p>
        </div>
        <button className="primaryButton" type="button" onClick={enableAlerts}>
          Enable Alert
        </button>
      </div>

      <div className="summaryGrid notifierGrid">
        <div className="summaryCard">
          <span>Notification</span>
          <strong>{permissionState}</strong>
        </div>
        <div className="summaryCard">
          <span>Tracked Hotspots</span>
          <strong>{hotspots.length}</strong>
        </div>
        <div className="summaryCard">
          <span>High-Risk Roads</span>
          <strong>{roads.filter((road) => road.level === "High").length}</strong>
        </div>
        <div className="summaryCard">
          <span>Nearest Distance</span>
          <strong>{nearest ? `${Math.round(nearest.distance)} m` : "--"}</strong>
        </div>
      </div>

      <div className="simpleListCard notifierStatus">
        <h3>Current Status</h3>
        <p>{status}</p>
      </div>
    </section>
  );
}
