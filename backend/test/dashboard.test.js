import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const suffix = Date.now();
const emailOne = `dashboard-one-${suffix}@example.com`;
const emailTwo = `dashboard-two-${suffix}@example.com`;

function cookies(response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]);
}

async function request(baseUrl, path, options = {}, cookie = "") {
  const headers = { ...options.headers };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  return {
    response,
    body: await response.json(),
    cookie: cookies(response).at(-1) || cookie,
  };
}

async function signup(baseUrl, email, organizationName) {
  const csrf = await request(baseUrl, "/api/auth/csrf-token");
  return request(baseUrl, "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf.body.csrfToken },
    body: JSON.stringify({ email, password: "password-123", organizationName }),
  }, csrf.cookie);
}

async function postProduct(baseUrl, client, product) {
  const csrf = await request(baseUrl, "/api/auth/csrf-token", {}, client.cookie);
  return request(baseUrl, "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf.body.csrfToken },
    body: JSON.stringify(product),
  }, client.cookie);
}

test("dashboard returns current organization totals and low-stock products", async (t) => {
  process.env.SESSION_SECRET = "dashboard-test-session-secret-at-least-32-characters";
  process.env.FRONTEND_ORIGIN = "http://localhost:5173";
  process.env.NODE_ENV = "test";

  const server = http.createServer(createApp(prisma));
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [emailOne, emailTwo] } } });
    await prisma.$disconnect();
    server.close();
  });

  const unauthenticated = await request(baseUrl, "/api/dashboard");
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.body.error, "Authentication required.");

  const oneSignup = await signup(baseUrl, emailOne, "Dashboard One");
  assert.equal(oneSignup.response.status, 201);
  const one = { cookie: oneSignup.cookie, organizationId: oneSignup.body.user.organization.id };
  const empty = await request(baseUrl, "/api/dashboard", {}, one.cookie);
  assert.deepEqual(empty.body, {
    totalProducts: 0,
    totalQuantity: 0,
    lowStockCount: 0,
    lowStockProducts: [],
  });

  await prisma.organizationSettings.update({
    where: { organizationId: one.organizationId },
    data: { defaultThreshold: 10 },
  });
  const lowByDefault = await postProduct(baseUrl, one, {
    name: "Default Threshold Item",
    sku: "DEFAULT-001",
    quantity: 10,
  });
  assert.equal(lowByDefault.response.status, 201);
  const lowByProduct = await postProduct(baseUrl, one, {
    name: "Product Threshold Item",
    sku: "PRODUCT-001",
    quantity: 3,
    lowStockThreshold: 3,
  });
  assert.equal(lowByProduct.response.status, 201);
  await postProduct(baseUrl, one, {
    name: "Healthy Item",
    sku: "HEALTHY-001",
    quantity: 11,
  });

  const oneDashboard = await request(baseUrl, "/api/dashboard", {}, one.cookie);
  assert.equal(oneDashboard.response.status, 200);
  assert.equal(oneDashboard.body.totalProducts, 3);
  assert.equal(oneDashboard.body.totalQuantity, 24);
  assert.equal(oneDashboard.body.lowStockCount, 2);
  assert.deepEqual(oneDashboard.body.lowStockProducts.map((product) => ({
    name: product.name,
    sku: product.sku,
    quantity: product.quantity,
    effectiveThreshold: product.effectiveThreshold,
  })), [
    { name: "Default Threshold Item", sku: "DEFAULT-001", quantity: 10, effectiveThreshold: 10 },
    { name: "Product Threshold Item", sku: "PRODUCT-001", quantity: 3, effectiveThreshold: 3 },
  ]);

  const twoSignup = await signup(baseUrl, emailTwo, "Dashboard Two");
  const two = { cookie: twoSignup.cookie };
  await postProduct(baseUrl, two, {
    name: "Other Organization Item",
    sku: "OTHER-001",
    quantity: 1,
    lowStockThreshold: 1,
  });
  const twoDashboard = await request(baseUrl, "/api/dashboard", {}, two.cookie);
  assert.equal(twoDashboard.body.totalProducts, 1);
  assert.equal(twoDashboard.body.totalQuantity, 1);
  assert.equal(twoDashboard.body.lowStockCount, 1);
  assert.equal(twoDashboard.body.lowStockProducts[0].sku, "OTHER-001");
});
