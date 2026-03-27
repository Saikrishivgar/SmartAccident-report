import { predictAccidentRisk } from "@/lib/riskModel";

export async function POST(req) {
  try {
    const payload = await req.json();
    const output = predictAccidentRisk(payload);

    return Response.json({
      input: payload,
      output
    });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
