import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const suffix = Date.now();
const emailOne = `products-one-${suffix}@example.com`;
const emailTwo = `products-two-${suffix}@example.com`;

function getCookies(response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]);
}

async function request(baseUrl, path, options = {}, cookie = "") {
  const headers = { ...options.headers };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = response.status === 204 ? null : await response.json();
  const cookies = getCookies(response);
  return { response, body, cookie: cookies.at(-1) || cookie };
}

async function createUser(baseUrl, email, organizationName) {
  const csrfResponse = await request(baseUrl, "/api/auth/csrf-token");
  const cookie = csrfResponse.cookie;
  const signup = await request(baseUrl, "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfResponse.body.csrfToken },
    body: JSON.stringify({ email, password: "password-123", organizationName }),
  }, cookie);
  assert.equal(signup.response.status, 201);
  return { cookie: signup.cookie, organizationId: signup.body.user.organization.id };
}

async function withCsrf(baseUrl, client, path, options = {}) {
  const csrf = await request(baseUrl, "/api/auth/csrf-token", {}, client.cookie);
  return request(baseUrl, path, {
    ...options,
    headers: { ...options.headers, "x-csrf-token": csrf.body.csrfToken },
  }, client.cookie);
}

test("product API enforces organization scope and low-stock rules", async (t) => {
  process.env.SESSION_SECRET = "products-test-session-secret-at-least-32-characters";
  process.env.FRONTEND_ORIGIN = "http://localhost:5173";
  process.env.NODE_ENV = "test";

  const app = createApp(prisma);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [emailOne, emailTwo] } } });
    await prisma.$disconnect();
    server.close();
  });

  assert.equal((await request(baseUrl, "/api/products")).response.status, 401);
  const one = await createUser(baseUrl, emailOne, "Products One");
  const two = await createUser(baseUrl, emailTwo, "Products Two");

  const createOne = await withCsrf(baseUrl, one, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Desk Lamp",
      sku: "LAMP-001",
      description: "Warm light",
      quantity: 5,
      costPrice: 10.5,
      sellingPrice: 19.99,
    }),
  });
  assert.equal(createOne.response.status, 201);
  assert.equal(createOne.body.product.isLowStock, true);
  assert.equal(createOne.body.product.effectiveThreshold, 5);
  const productId = createOne.body.product.id;

  await prisma.organizationSettings.update({
    where: { organizationId: one.organizationId },
    data: { defaultThreshold: 10 },
  });
  const defaultThresholdProduct = await withCsrf(baseUrl, one, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Threshold Test", sku: "THRESHOLD-001", quantity: 10 }),
  });
  assert.equal(defaultThresholdProduct.body.product.effectiveThreshold, 10);
  assert.equal(defaultThresholdProduct.body.product.isLowStock, true);

  const duplicate = await withCsrf(baseUrl, one, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Duplicate", sku: "LAMP-001", quantity: 10 }),
  });
  assert.equal(duplicate.response.status, 409);

  const createOther = await withCsrf(baseUrl, two, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Other Lamp", sku: "LAMP-001", quantity: 10 }),
  });
  assert.equal(createOther.response.status, 201);

  const searchByName = await request(baseUrl, "/api/products?search=desk", {}, one.cookie);
  const searchBySku = await request(baseUrl, "/api/products?search=001", {}, one.cookie);
  assert.equal(searchByName.body.products.length, 1);
  assert.equal(searchBySku.body.products[0].id, productId);

  const invalidQuantity = await withCsrf(baseUrl, one, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Invalid", sku: "INVALID", quantity: -1 }),
  });
  assert.equal(invalidQuantity.response.status, 400);
  const invalidThreshold = await withCsrf(baseUrl, one, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Invalid", sku: "INVALID-2", quantity: 1, lowStockThreshold: 1.5 }),
  });
  assert.equal(invalidThreshold.response.status, 400);

  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const options = method === "GET" ? {} : {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(method === "PUT" ? {
        name: "Hijack", sku: "HIJACK", quantity: 1, lowStockThreshold: null,
      } : { quantity: 1 }),
    };
    const productPath = method === "PATCH" ? `/api/products/${productId}/quantity` : `/api/products/${productId}`;
    const result = method === "GET"
      ? await request(baseUrl, productPath, options, two.cookie)
      : await withCsrf(baseUrl, two, productPath, options);
    assert.equal(result.response.status, 404, `${method} must reject cross-organization product access`);
  }

  const update = await withCsrf(baseUrl, one, `/api/products/${productId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Updated Lamp",
      sku: "LAMP-UPDATED",
      description: "Updated",
      quantity: 6,
      costPrice: 11,
      sellingPrice: 20,
      lowStockThreshold: 6,
    }),
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.product.isLowStock, true);

  const quantity = await withCsrf(baseUrl, one, `/api/products/${productId}/quantity`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity: 7 }),
  });
  assert.equal(quantity.response.status, 200);
  assert.equal(quantity.body.product.isLowStock, false);

  const deleted = await withCsrf(baseUrl, one, `/api/products/${productId}`, { method: "DELETE" });
  assert.equal(deleted.response.status, 204);
  assert.equal((await request(baseUrl, `/api/products/${productId}`, {}, one.cookie)).response.status, 404);
});
