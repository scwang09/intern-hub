import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

// This route generates a short-lived upload token so the browser can upload
// files directly to Vercel Blob, bypassing the 4.5MB serverless body limit.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
          "text/csv",
          "text/plain",
          // Allow generic binary so files without MIME types still upload
          "application/octet-stream",
        ],
        maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB
      }),
      onUploadCompleted: async () => {
        // Nothing to do here — the review API handles the rest
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
