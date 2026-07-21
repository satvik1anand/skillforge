import { Router, type RequestHandler } from "express";

import { ApiError } from "../middleware/error-handler.js";

export function createAuthRouter(requireAuthentication: RequestHandler): Router {
  const router = Router();

  router.get("/me", requireAuthentication, (request, response, next) => {
    const auth = request.auth;

    if (!auth) {
      next(
        new ApiError(
          500,
          "AUTH_CONTEXT_MISSING",
          "Authenticated request context is missing.",
          { expose: false },
        ),
      );
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      data: {
        user: {
          id: auth.userId,
          role: auth.role,
          ...(auth.email ? { email: auth.email } : {}),
        },
      },
    });
  });

  return router;
}
