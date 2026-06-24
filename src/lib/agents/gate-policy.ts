import type { AgentDecision } from "@/lib/agents/schemas";

type GateFinding = {
  severity: string;
  status: string;
};

type GateAgentRun = {
  agentKey: string;
  status: string;
};

const decisionRank: Record<AgentDecision, number> = {
  pass: 0,
  needs_revision: 1,
  blocked: 2
};

export function maxDecision(left: AgentDecision, right: AgentDecision): AgentDecision {
  return decisionRank[left] >= decisionRank[right] ? left : right;
}

export function evaluateGatePolicy(input: {
  targetType: string;
  consensusFindings: GateFinding[];
  agentRuns: GateAgentRun[];
}): {
  decision: AgentDecision;
  reasons: string[];
  counts: Record<string, number>;
} {
  const open = input.consensusFindings.filter((finding) => finding.status === "open");
  const counts = {
    critical: open.filter((finding) => finding.severity === "critical").length,
    high: open.filter((finding) => finding.severity === "high").length,
    medium: open.filter((finding) => finding.severity === "medium").length,
    failedAgents: input.agentRuns.filter((run) => run.status === "failed").length
  };
  const reasons: string[] = [];
  let decision: AgentDecision = "pass";

  if (counts.critical >= 1) {
    decision = "blocked";
    reasons.push("At least one critical open consensus finding exists.");
  }
  if (counts.high >= 2) {
    decision = "blocked";
    reasons.push("At least two high open consensus findings exist.");
  } else if (counts.high === 1) {
    decision = maxDecision(decision, "needs_revision");
    reasons.push("One high open consensus finding exists.");
  }
  if (counts.medium >= 3) {
    decision = maxDecision(decision, "needs_revision");
    reasons.push("At least three medium open consensus findings exist.");
  }
  if (counts.failedAgents >= 2) {
    decision = maxDecision(decision, "needs_revision");
    reasons.push("At least two agent runs failed.");
  }
  if (input.targetType === "release") {
    const releaseRun = input.agentRuns.find((run) => run.agentKey === "release-agent");
    if (!releaseRun || releaseRun.status !== "succeeded") {
      decision = "blocked";
      reasons.push("Release target requires a successful release-agent run.");
    }
  }

  return { decision, reasons, counts };
}

export function gateBlocksTargetAction(targetType: string, decision: string) {
  if (decision !== "blocked") return false;
  return targetType === "research" || targetType === "prd" || targetType === "codex_pack" || targetType === "release";
}
