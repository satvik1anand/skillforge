import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    options: { expose?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.expose = options.expose ?? statusCode < 500;
  }
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new ApiError(
      404,
      "NOT_FOUND",
      `No route matches ${request.method} ${request.path}.`,
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred.";

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.expose ? error.message : message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = "INVALID_REQUEST";
    message = "One or more request values are invalid.";
  } else if (error instanceof SyntaxError && "body" in error) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Request body must contain valid JSON.";
  }

  // Deliberately log only request metadata. Do not risk recording request
  // bodies, credentials, tokens, or third-party error contents.
  console.error(
    JSON.stringify({
      event: "request_error",
      method: request.method,
      path: request.path,
      statusCode,
      code,
      // The error class is safe operational metadata. It preserves the
      // privacy boundary above while making generic 500s diagnosable without
      // logging a request body, token, database response, or model content.
      errorName: error instanceof Error ? error.name : typeof error,
    }),
  );

  response.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
};
