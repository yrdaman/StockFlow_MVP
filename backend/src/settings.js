import { Router } from "express";
import { requireAuth, requireOrganizationContext, requireCsrf } from "./auth.js";

export function createSettingsRouter(prisma) {
  const router = Router();
  router.use(requireAuth, requireOrganizationContext);

  router.get("/", async (request, response, next) => {
    try {
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: request.organizationId },
      });
      response.json({ defaultThreshold: settings?.defaultThreshold ?? 5 });
    } catch (error) {
      next(error);
    }
  });

  router.put("/", requireCsrf, async (request, response, next) => {
    const value = Number(request.body?.defaultThreshold);
    if (!Number.isInteger(value) || value < 0) {
      return response.status(400).json({ error: "Threshold must be a whole number, 0 or more." });
    }
    try {
      const settings = await prisma.organizationSettings.upsert({
        where: { organizationId: request.organizationId },
        update: { defaultThreshold: value },
        create: { organizationId: request.organizationId, defaultThreshold: value },
      });
      response.json({ defaultThreshold: settings.defaultThreshold });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const apiUrl = import.meta.env.PROD
  ? "https://stockflow-mvp-jve2.onrender.com"
  : "http://localhost:3000";