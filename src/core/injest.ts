import { ZodError } from "zod";
import { buildEnvelope } from "./envelop";
import { routeEnvelope } from "./router";
import { logger } from "../utils/logger";

export async function injest(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const envelope = buildEnvelope(body);
    const dispatchedTo = await routeEnvelope(envelope);

    logger.info("envelope accepted", {
      envelopeId: envelope.id,
      type: envelope.type,
      correlationId: envelope.correlationId,
      dispatchedTo,
    });

    return Response.json(
      { id: envelope.id, correlationId: envelope.correlationId, dispatchedTo },
      { status: 202 }
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json({ error: "invalid envelope", details: err.issues }, { status: 400 });
    }
    logger.error("injest failed", { error: (err as Error).message });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}