import { Router } from "express";

import {
  getConfigurationReadiness,
  type ServerConfig,
} from "../config/env.js";

export function createHealthRouter(config: ServerConfig): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      status: "ok",
      service: "skillforge-api",
      timestamp: new Date().toISOString(),
      configuration: getConfigurationReadiness(config),
    });
  });

  return router;
}
