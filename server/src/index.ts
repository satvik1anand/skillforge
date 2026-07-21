import "dotenv/config";

import { createApp } from "./app.js";
import {
  EnvironmentValidationError,
  getConfigurationReadiness,
  loadServerConfig,
  type ServerConfig,
} from "./config/env.js";

function bootstrap(): void {
  let config: ServerConfig;

  try {
    config = loadServerConfig();
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      // The formatter in env.ts reports field names and validation rules only;
      // values are intentionally excluded so a secret cannot leak to logs.
      console.error(`Invalid server configuration: ${error.issues.join("; ")}`);
    } else {
      console.error("Unable to load server configuration.");
    }

    process.exitCode = 1;
    return;
  }

  const app = createApp(config);
  // Bind explicitly to all IPv4 interfaces for container hosts such as Railway.
  // Relying on Node's unspecified-host default can bind to IPv6-only in some
  // runtimes, leaving a healthy process unreachable from the platform proxy.
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.info(
      JSON.stringify({
        event: "server_started",
        port: config.port,
        environment: config.nodeEnv,
        configuration: getConfigurationReadiness(config),
      }),
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.info(JSON.stringify({ event: "server_shutdown_requested", signal }));

    const forceExitTimer = setTimeout(() => {
      console.error(JSON.stringify({ event: "server_shutdown_timed_out", signal }));
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close((error) => {
      clearTimeout(forceExitTimer);

      if (error) {
        console.error(JSON.stringify({ event: "server_shutdown_failed", signal }));
        process.exitCode = 1;
        return;
      }

      console.info(JSON.stringify({ event: "server_stopped", signal }));
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap();
