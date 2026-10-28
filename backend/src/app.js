import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import cors from "cors";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import SQLiteStoreFactory from "connect-sqlite3";
import connectPgSimple from "connect-pg-simple";
import { PrismaClient } from "@prisma/client";
import {
  createAuthRouter,
  loadOrganizationContext,
  requireAuth,
  requireOrganizationContext,
} from "./auth.js";
import { createProductRouter } from "./products.js";
import { createDashboardRouter } from "./dashboard.js";

const SQLiteStore = SQLiteStoreFactory(session);
const PgSessionStore = connectPgSimple(session);

export function createApp(prisma = new PrismaClient()) {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const allowedFrontendOrigins = process.env.NODE_ENV === "production"
    ? [frontendOrigin]
    : [frontendOrigin, "http://localhost:5173", "http://localhost:4173"];
  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }
  if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_ORIGIN) {
    throw new Error("FRONTEND_ORIGIN is required in production.");
  }

  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedFrontendOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
  }));
  app.use(express.json());
  app.use(session({
    name: "stockflow.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: process.env.NODE_ENV === "production"
      ? new PgSessionStore({
        conString: process.env.NEON_DATABASE_URL,
        createTableIfMissing: true,
      })
      : new SQLiteStore({
        db: "sessions.db",
        dir: path.resolve(process.cwd(), process.env.SESSION_DB_DIR || "./prisma"),
      }),
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }));
  app.use((request, _response, next) => {
    request.prisma = prisma;
    next();
  });
  app.use(loadOrganizationContext);

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/auth/csrf-token", (request, response) => {
    if (!request.session.csrfToken) {
      request.session.csrfToken = cryptoRandomToken();
    }
    response.json({ csrfToken: request.session.csrfToken });
  });
  app.use("/api/auth", createAuthRouter(prisma));

  app.get("/api/protected", requireAuth, requireOrganizationContext, (request, response) => {
    response.json({
      user: {
        id: request.authUser.id,
        email: request.authUser.email,
      },
      organization: {
        id: request.authUser.organization.id,
        name: request.authUser.organization.name,
      },
    });
  });
  app.use("/api/products", createProductRouter(prisma));
  app.use("/api/dashboard", createDashboardRouter(prisma));

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  });

  return app;
}

function cryptoRandomToken() {
  return randomBytes(32).toString("hex");
}

