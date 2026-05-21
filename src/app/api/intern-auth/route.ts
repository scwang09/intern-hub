import { NextRequest, NextResponse } from "next/server";

const PIN_MAP: Record<string, string | undefined> = {
  natalie: process.env.INTERN_PIN_NATALIE,
  sam: process.env.INTERN_PIN_SAM,
};

export async function POST(req: NextRequest) {
  const { name, pin } = await req.json();
  if (!name || !pin) {
    return NextResponse.json({ error: "Missing name or pin" }, { status: 400 });
  }

  const key = name.toLowerCase();
  const expected = PIN_MAP[key];

  if (!expected) {
    return NextResponse.json({ error: "Unknown intern" }, { status: 400 });
  }

  if (pin !== expected) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
