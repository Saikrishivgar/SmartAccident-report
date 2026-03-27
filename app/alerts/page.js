import AlertsCenter from "@/components/AlertsCenter";

const alertGuides = [
  "High risk means poor visibility, heavy traffic, or dangerous road conditions are combining strongly.",
  "Medium risk signals caution: one or two factors are elevated and deserve route or speed adjustments.",
  "Low risk does not mean zero risk. It means the observed factors are comparatively safer."
];

export default function Alerts() {
  return (
    <main className="pageShell">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Alert Guidance</p>
            <h1>Interpreting accident risk alerts</h1>
          </div>
        </div>
        <div className="insightGrid">
          {alertGuides.map((guide) => (
            <article className="insightCard" key={guide}>
              <p>{guide}</p>
            </article>
          ))}
        </div>
      </section>

      <AlertsCenter />
    </main>
  );
}
