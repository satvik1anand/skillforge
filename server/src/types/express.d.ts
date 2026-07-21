import type { AuthenticatedRequestContext } from "../auth/access-token-verifier.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
