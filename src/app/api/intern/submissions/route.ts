import { NextRequest, NextResponse } from "next/server";
import { getAllSubmissions } from "@/lib/db";

const PIN_MAP: Record<string, string | undefined> = {
  natalie: process.env.INTERN_PIN_NATALIE,
  sam: process.env.INTERN_PIN_SAM,
};

function verifyIntern(req: NextRequest): string | null {
  const name = req.headers.get("x-intern-name");
  const pin = req.headers.get("x-intern-pin");
  if (!name || !pin) return null;
  const key = name.toLowerCase();
  const expected = PIN_MAP[key];
  if (!expected || pin !== expected) return null;
  return name;
}

export async function GET(req: NextRequest) {
  const internName = verifyIntern(req);
  if (!internName) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const all = await getAllSubmissions();
  // Return only this intern's submissions
  const mine = all.filter(
    (s) => s.intern.toLowerCase() === internName.toLowerCase()
  );

  return NextResponse.json({ submissions: mine });
}
