import bcrypt from "bcrypt";
import { Router } from "express";
import rateLimit from "express-rate-limit";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    organization: {
      id: user.organization.id,
      name: user.organization.name,
    },
  };
}

function validateCredentials(email, password) {
  const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
  if (!emailPattern.test(normalizedEmail)) {
    return { error: "Enter a valid email address." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  return { normalizedEmail };
}

export function requireCsrf(request, response, next) {
  const token = request.get("x-csrf-token");
  if (!token || token !== request.session.csrfToken) {
    return response.status(403).json({ error: "Invalid CSRF token." });
  }
  next();
}

export function requireAuth(request, response, next) {
  if (!request.session.userId) {
    return response.status(401).json({ error: "Authentication required." });
  }
  next();
}

export async function loadOrganizationContext(request, _response, next) {
  if (!request.session.userId) {
    return next();
  }
  request.authUser = await request.prisma.user.findUnique({
    where: { id: request.session.userId },
    include: { organization: true },
  });
  next();
}

export function requireOrganizationContext(request, response, next) {
  if (!request.authUser) {
    return response.status(401).json({ error: "Authentication required." });
  }
  request.organizationId = request.authUser.organizationId;
  next();
}

export function createAuthRouter(prisma) {
  const router = Router();
  router.use(authRateLimit);

  router.post("/signup", requireCsrf, async (request, response, next) => {
    const { email, password, organizationName } = request.body;
    const credentials = validateCredentials(email, password);
    if (credentials.error) {
      return response.status(400).json({ error: credentials.error });
    }
    if (typeof organizationName !== "string" || !organizationName.trim()) {
      return response.status(400).json({ error: "Organization name is required." });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.$transaction(async (transaction) => {
        const organization = await transaction.organization.create({
          data: {
            name: organizationName.trim(),
            settings: { create: {} },
          },
        });
        return transaction.user.create({
          data: {
            email: credentials.normalizedEmail,
            normalizedEmail: credentials.normalizedEmail,
            passwordHash,
            organizationId: organization.id,
          },
          include: { organization: true },
        });
      });

      await regenerateSession(request);
      request.session.userId = user.id;
      return response.status(201).json({ user: safeUser(user) });
    } catch (error) {
      if (error.code === "P2002") {
        return response.status(409).json({ error: "An account with that email already exists." });
      }
      next(error);
    }
  });

  router.post("/login", requireCsrf, async (request, response, next) => {
    const { email, password } = request.body;
    const credentials = validateCredentials(email, password);
    if (credentials.error) {
      return response.status(400).json({ error: "Invalid email or password." });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { normalizedEmail: credentials.normalizedEmail },
        include: { organization: true },
      });
      const valid = user && await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return response.status(401).json({ error: "Invalid email or password." });
      }

      await regenerateSession(request);
      request.session.userId = user.id;
      return response.json({ user: safeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", requireCsrf, (request, response, next) => {
    request.session.destroy((error) => {
      if (error) {
        return next(error);
      }
      response.clearCookie("stockflow.sid");
      response.status(204).end();
    });
  });

  router.get("/me", requireAuth, async (request, response, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: request.session.userId },
        include: { organization: true },
      });
      if (!user) {
        return response.status(401).json({ error: "Authentication required." });
      }
      response.json({ user: safeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
