import { NextRequest, NextResponse } from "next/server";
import { getSubmission } from "@/lib/db";

function verifyAuth(req: NextRequest): boolean {
  const pwd = req.headers.get("x-manager-password");
  return !!pwd && pwd === process.env.MANAGER_PASSWORD;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const sub = await getSubmission(id);

  if (!sub?.fileUrl) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Proxy the file from Blob storage so the browser downloads it
  const upstream = await fetch(sub.fileUrl);
  const contentType =
    upstream.headers.get("Content-Type") || "application/octet-stream";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${sub.fileName}"`,
    },
  });
}
