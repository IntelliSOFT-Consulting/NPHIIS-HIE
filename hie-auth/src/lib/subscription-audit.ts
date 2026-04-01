import { Response } from "express";
import { prisma } from "./prisma";

export type SubscriptionCallbackOutcome = "success" | "error" | "skipped";

export interface SubscriptionAuditInfo {
  route: string;
  resourceType: string;
  resourceId?: string;
}

/**
 * Register a one-shot listener to persist callback metadata after the response is sent.
 * Handlers should set res.locals.subscriptionOutcome and optional res.locals.subscriptionErrorMessage before ending.
 */
export function attachSubscriptionAuditLog(
  res: Response,
  info: SubscriptionAuditInfo,
  startTime: number = Date.now()
): void {
  res.on("finish", () => {
    const status = res.statusCode;
    const locals = res.locals as {
      subscriptionOutcome?: SubscriptionCallbackOutcome;
      subscriptionErrorMessage?: string;
      subscriptionDetail?: Record<string, unknown>;
    };
    const outcome: SubscriptionCallbackOutcome =
      locals.subscriptionOutcome ??
      (status >= 400 ? "error" : "success");
    const durationMs = Date.now() - startTime;
    const errorMessage =
      outcome === "error"
        ? locals.subscriptionErrorMessage?.slice(0, 2000) ?? null
        : null;

    prisma.fhirSubscriptionCallbackLog
      .create({
        data: {
          route: info.route,
          resourceType: info.resourceType,
          resourceId: info.resourceId ?? null,
          httpStatus: status,
          outcome,
          errorMessage,
          durationMs,
          detail: locals.subscriptionDetail ? (locals.subscriptionDetail as object) : undefined,
        },
      })
      .catch((e) => console.error("FhirSubscriptionCallbackLog write failed:", e));
  });
}
