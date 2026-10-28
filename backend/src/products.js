import { Router } from "express";
import { requireAuth, requireCsrf, requireOrganizationContext } from "./auth.js";

const MAX_NAME_LENGTH = 200;
const MAX_SKU_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;

function productResponse(product, defaultThreshold) {
  const effectiveThreshold = product.lowStockThreshold ?? defaultThreshold ?? 5;
  return {
    id: product.id,
    organizationId: product.organizationId,
    name: product.name,
    sku: product.sku,
    description: product.description,
    quantity: product.stockQuantity,
    costPrice: product.costPrice,
    sellingPrice: product.sellingPrice,
    lowStockThreshold: product.lowStockThreshold,
    effectiveThreshold,
    isLowStock: product.stockQuantity <= effectiveThreshold,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function parseProductInput(body, partial = false) {
  const data = {};
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > MAX_NAME_LENGTH) {
      return { error: "Name is required and must be 200 characters or fewer." };
    }
    data.name = body.name.trim();
  }
  if (!partial || body.sku !== undefined) {
    if (typeof body.sku !== "string" || !body.sku.trim() || body.sku.trim().length > MAX_SKU_LENGTH) {
      return { error: "SKU is required and must be 100 characters or fewer." };
    }
    data.sku = body.sku.trim();
  }
  if (body.description !== undefined) {
    if (body.description !== null && (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION_LENGTH)) {
      return { error: "Description must be 2000 characters or fewer." };
    }
    data.description = body.description?.trim() || null;
  }
  for (const field of ["costPrice", "sellingPrice"]) {
    if (body[field] !== undefined) {
      if (body[field] !== null && (typeof body[field] !== "number" || !Number.isFinite(body[field]) || body[field] < 0)) {
        return { error: `${field} must be a non-negative number.` };
      }
      data[field] = body[field];
    }
  }
  for (const field of ["quantity", "lowStockThreshold"]) {
    if (field === "quantity" ? (!partial || body[field] !== undefined) : body[field] !== undefined) {
      const value = body[field] === undefined && field === "quantity" ? 0 : body[field];
      if (field === "lowStockThreshold" && value === null) {
        data.lowStockThreshold = null;
        continue;
      }
      if (!Number.isInteger(value) || value < 0) {
        return { error: `${field} must be a non-negative integer.` };
      }
      data[field === "quantity" ? "stockQuantity" : field] = value;
    }
  }
  return { data };
}

export function createProductRouter(prisma) {
  const router = Router();
  router.use(requireAuth, requireOrganizationContext);

  router.get("/", async (request, response, next) => {
    try {
      const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
      const products = await prisma.product.findMany({
        where: {
          organizationId: request.organizationId,
          ...(search ? {
            OR: [
              { name: { contains: search } },
              { sku: { contains: search } },
            ],
          } : {}),
        },
        orderBy: { name: "asc" },
      });
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: request.organizationId },
      });
      response.json({ products: products.map((product) => productResponse(product, settings?.defaultThreshold)) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const product = await prisma.product.findFirst({
        where: { id: request.params.id, organizationId: request.organizationId },
      });
      if (!product) return response.status(404).json({ error: "Product not found." });
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: request.organizationId },
      });
      response.json({ product: productResponse(product, settings?.defaultThreshold) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireCsrf, async (request, response, next) => {
    const parsed = parseProductInput(request.body);
    if (parsed.error) return response.status(400).json({ error: parsed.error });
    try {
      const product = await prisma.product.create({
        data: { ...parsed.data, organizationId: request.organizationId },
      });
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: request.organizationId },
      });
      response.status(201).json({ product: productResponse(product, settings?.defaultThreshold) });
    } catch (error) {
      if (error.code === "P2002") return response.status(409).json({ error: "SKU already exists in this organization." });
      next(error);
    }
  });

  router.put("/:id", requireCsrf, async (request, response, next) => {
    const parsed = parseProductInput(request.body);
    if (parsed.error) return response.status(400).json({ error: parsed.error });
    try {
      const existing = await prisma.product.findFirst({
        where: { id: request.params.id, organizationId: request.organizationId },
      });
      if (!existing) return response.status(404).json({ error: "Product not found." });
      const product = await prisma.product.update({ where: { id: existing.id }, data: parsed.data });
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: request.organizationId },
      });
      response.json({ product: productResponse(product, settings?.defaultThreshold) });
    } catch (error) {
      if (error.code === "P2002") return response.status(409).json({ error: "SKU already exists in this organization." });
      next(error);
    }
  });

  router.patch("/:id/quantity", requireCsrf, async (request, response, next) => {
    const parsed = parseProductInput({ quantity: request.body.quantity }, true);
    if (parsed.error) return response.status(400).json({ error: parsed.error });
    try {
      const existing = await prisma.product.findFirst({
        where: { id: request.params.id, organizationId: request.organizationId },
      });
      if (!existing) return response.status(404).json({ error: "Product not found." });
      const product = await prisma.product.update({ where: { id: existing.id }, data: parsed.data });
      const settings = await prisma.organizationSettings.findUnique({
        where: { organizationId: request.organizationId },
      });
      response.json({ product: productResponse(product, settings?.defaultThreshold) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", requireCsrf, async (request, response, next) => {
    try {
      const deleted = await prisma.product.deleteMany({
        where: { id: request.params.id, organizationId: request.organizationId },
      });
      if (!deleted.count) return response.status(404).json({ error: "Product not found." });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
