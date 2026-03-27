import RiskWorkbench from "@/components/RiskWorkbench";

const stages = [
  {
    title: "1. Data collection",
    body: "Historical accident records, location signals, weather, traffic flow, and road characteristics are gathered as the prediction base."
  },
  {
    title: "2. Preprocessing",
    body: "Missing values are handled, categories are encoded, and raw signals are normalized into comparable model inputs."
  },
  {
    title: "3. Feature selection",
    body: "The strongest predictors are time, weather, traffic density, road condition, road type, and speed limit."
  },
  {
    title: "4. Prediction output",
    body: "The system returns a Low, Medium, or High risk label with a score breakdown and practical recommendations."
  }
];

export default function Dashboard() {
  return (
    <main className="pageShell">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Project Dashboard</p>
            <h1>System workflow and interactive analysis</h1>
          </div>
        </div>
        <div className="timelineGrid">
          {stages.map((stage) => (
            <article className="insightCard" key={stage.title}>
              <h3>{stage.title}</h3>
              <p>{stage.body}</p>
            </article>
          ))}
        </div>
      </section>

      <RiskWorkbench compact />
    </main>
  );
}
