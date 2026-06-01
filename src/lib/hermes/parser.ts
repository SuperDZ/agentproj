import { hermesResearchOutputSchema, type HermesResearchOutput } from "./types";

export function parseHermesResearchOutput(raw: string | unknown): HermesResearchOutput {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return hermesResearchOutputSchema.parse(value);
}
