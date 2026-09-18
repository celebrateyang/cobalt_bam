import { agentError } from "../db/video-agent.js";

export const ACTIVE_RUN_STATES = ["queued", "planning", "awaiting_input", "running", "cancelling"];
const runTransitions = {
    queued: ["planning", "running", "cancelled", "failed"],
    planning: ["awaiting_input", "running", "cancelling", "failed"],
    awaiting_input: ["planning", "running", "cancelled", "failed"],
    running: ["cancelling", "completed", "partially_completed", "failed"],
    cancelling: ["cancelled"], cancelled: [], completed: [], partially_completed: [], failed: [],
};
const stepTransitions = {
    pending: ["ready", "cancelled", "skipped"], ready: ["running", "cancelled", "skipped"],
    running: ["succeeded", "failed", "retry_wait", "cancelled"], retry_wait: ["ready", "failed", "cancelled"],
    succeeded: [], failed: [], cancelled: [], skipped: [],
};
export const assertTransition = (kind, from, to) => {
    const transitions = kind === "run" ? runTransitions : kind === "step" ? stepTransitions : {};
    if (!transitions[from]?.includes(to)) throw agentError("VIDEO_AGENT_STATE_CONFLICT", 409, `Invalid ${kind} transition`);
};
export const assertCompletion = ({ status, steps, requestedCount, producedCount }) => {
    const publish = steps.find((step) => step.stage === "publish_results");
    const verify = steps.find((step) => step.stage === "verify");
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 5 || !Number.isInteger(producedCount) || producedCount <= 0 || producedCount > requestedCount || !publish || !verify || publish.status !== "succeeded" || verify.status !== "succeeded"
        || steps.some((step) => !["succeeded", "failed", "cancelled", "skipped"].includes(step.status))
        || (status === "completed" && (producedCount !== requestedCount || steps.some((step) => !["succeeded", "skipped"].includes(step.status))))
        || (status === "partially_completed" && producedCount >= requestedCount)
        || !["completed", "partially_completed"].includes(status)) throw agentError("VIDEO_AGENT_RESULTS_UNVERIFIED", 409, "Results have not passed completion checks");
};
