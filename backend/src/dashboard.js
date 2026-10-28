import { Router } from "express";
import { requireAuth, requireOrganizationContext } from "./auth.js";

function dashboardProduct(product, defaultThreshold) {
  const effectiveThreshold = product.lowStockThreshold ?? defaultThreshold ?? 5;
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    quantity: product.stockQuantity,
    effectiveThreshold,
  };
}

export function createDashboardRouter(prisma) {
  const router = Router();
  router.use(requireAuth, requireOrganizationContext);

  router.get("/", async (request, response, next) => {
    try {
      const [products, settings] = await Promise.all([
        prisma.product.findMany({
          where: { organizationId: request.organizationId },
          orderBy: { name: "asc" },
        }),
        prisma.organizationSettings.findUnique({
          where: { organizationId: request.organizationId },
        }),
      ]);
      const defaultThreshold = settings?.defaultThreshold ?? 5;
      const lowStockProducts = products
        .filter((product) => product.stockQuantity <= (product.lowStockThreshold ?? defaultThreshold))
        .map((product) => dashboardProduct(product, defaultThreshold));

      response.json({
        totalProducts: products.length,
        totalQuantity: products.reduce((total, product) => total + product.stockQuantity, 0),
        lowStockCount: lowStockProducts.length,
        lowStockProducts,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
