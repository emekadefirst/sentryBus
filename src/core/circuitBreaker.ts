type BreakerState = "closed" | "open" | "half-open";

interface Breaker {
  state: BreakerState;
  failures: number;
  openedAt: number;
  probing: boolean;
}

// In-process, per-adapter. Fine for a single bus instance — move this to
// Redis only once you're running multiple instances that need to share
// breaker state.
const breakers = new Map<string, Breaker>();

function getBreaker(name: string): Breaker {
  let b = breakers.get(name);
  if (!b) {
    b = { state: "closed", failures: 0, openedAt: 0, probing: false };
    breakers.set(name, b);
  }
  return b;
}

// Call before attempting dispatch. False means don't touch the network at
// all — let the job fail fast and retry later on its own schedule.
export function allowDispatch(adapterName: string, cooldownMs: number): boolean {
  const b = getBreaker(adapterName);
  if (b.state === "closed") return true;

  const cooledDown = Date.now() - b.openedAt >= cooldownMs;
  if (b.state === "open" && cooledDown && !b.probing) {
    b.state = "half-open";
    b.probing = true;
    return true; // exactly one probe gets through
  }
  return false;
}

export function recordSuccess(adapterName: string): void {
  const b = getBreaker(adapterName);
  b.state = "closed";
  b.failures = 0;
  b.probing = false;
}

export function recordFailure(adapterName: string, failureThreshold: number): void {
  const b = getBreaker(adapterName);
  b.failures += 1;
  b.probing = false;
  if (b.state === "half-open" || b.failures >= failureThreshold) {
    b.state = "open";
    b.openedAt = Date.now();
  }
}