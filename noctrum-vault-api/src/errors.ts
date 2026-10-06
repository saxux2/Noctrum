import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// CPT error codes (BACKEND §2.2).
export type ErrorCode =
  | "bad_request"
  | "request_auth_failed"
  | "request_auth_expired"
  | "insufficient_balance"
  | "operation_denied_by_policy"
  | "invalid_recipient";

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  request_auth_failed: 401,
  request_auth_expired: 401,
  insufficient_balance: 400,
  operation_denied_by_policy: 403,
  invalid_recipient: 400,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public details: string,
  ) {
    super(details);
  }
}

export function errorResponse(c: Context, err: unknown) {
  const request_id = crypto.randomUUID();
  if (err instanceof ApiError) {
    return c.json(
      { error: err.code, error_details: err.details, request_id },
      STATUS[err.code],
    );
  }
  console.error(`[${request_id}]`, err);
  return c.json(
    { error: "internal_error", error_details: "Internal server error", request_id },
    500,
  );
}
