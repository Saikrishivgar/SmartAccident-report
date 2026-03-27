import { getCityAccidentInsights } from "@/lib/accidentInsights";
import { loadAccidentData } from "@/lib/dataParser";

export async function GET() {
  const data = loadAccidentData();
  return Response.json({ accidents: data });
}

export async function POST(req) {
  try {
    const { city } = await req.json();

    return Response.json({
      insights: getCityAccidentInsights(city || "")
    });
  } catch {
    return Response.json({ error: "Unable to analyze accident data" }, { status: 400 });
  }
}
