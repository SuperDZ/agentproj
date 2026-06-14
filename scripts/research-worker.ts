import { prisma } from "@/lib/db/prisma";
import { processResearchWorkerOnce, researchWorkerPollIntervalMs, runResearchWorkerLoop } from "@/lib/services/project-flow";

async function main() {
  if (process.argv.includes("--once")) {
    const result = await processResearchWorkerOnce();
    console.log(JSON.stringify(result));
    return;
  }

  console.log(`Research worker started. pollIntervalMs=${researchWorkerPollIntervalMs()}`);
  await runResearchWorkerLoop();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
