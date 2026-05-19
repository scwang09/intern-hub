import { NextRequest, NextResponse } from "next/server";
import { getAllSubmissions } from "@/lib/db";

function verifyAuth(req: NextRequest): boolean {
  const pwd = req.headers.get("x-manager-password");
  return !!pwd && pwd === process.env.MANAGER_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const submissions = await getAllSubmissions();
  return NextResponse.json({ submissions });
}
