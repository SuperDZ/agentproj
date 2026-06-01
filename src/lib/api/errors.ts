import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError("Invalid request input", 400, error.flatten().fieldErrors);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return jsonError("Resource not found", 404);
  }
  if (error instanceof Error) {
    return jsonError(error.message, 500);
  }
  return jsonError("Unexpected server error", 500);
}
