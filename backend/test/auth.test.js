import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const emailOne = `auth-test-${Date.now()}@example.com`;
const emailTwo = `auth-test-two-${Date.now()}@example.com`;

function cookiesFrom(response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]);
}

async function request(baseUrl, path, options = {}, cookie = "") {
  const headers = { ...options.headers };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const cookies = cookiesFrom(response);
  return {
    response,
    body: response.status === 204 ? null : await response.json(),
    cookie: cookies.length ? cookies.at(-1) : cookie,
  };
}

test("authentication and organization isolation", async (t) => {
  process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
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

  const unauthenticated = await request(baseUrl, "/api/auth/me");
  assert.equal(unauthenticated.response.status, 401);
  const protectedUnauthenticated = await request(baseUrl, "/api/protected");
  assert.equal(protectedUnauthenticated.response.status, 401);

  const csrfResponse = await request(baseUrl, "/api/auth/csrf-token", {
    headers: { origin: "http://localhost:5173" },
  });
  assert.equal(csrfResponse.response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  let sessionOne = csrfResponse.cookie;
  const csrfOne = (await request(baseUrl, "/api/auth/csrf-token", {}, sessionOne)).body.csrfToken;
  const signupOne = await request(baseUrl, "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfOne },
    body: JSON.stringify({
      email: ` ${emailOne.toUpperCase()} `,
      password: "password-one",
      organizationName: "Organization One",
    }),
  }, sessionOne);
  assert.equal(signupOne.response.status, 201);
  assert.equal(signupOne.body.user.email, emailOne);
  assert.equal(signupOne.body.user.organization.name, "Organization One");
  sessionOne = signupOne.cookie;

  const duplicate = await request(baseUrl, "/api/auth/csrf-token", {}, sessionOne);
  const duplicateSignup = await request(baseUrl, "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": duplicate.body.csrfToken },
    body: JSON.stringify({ email: emailOne, password: "password-one", organizationName: "Duplicate" }),
  }, sessionOne);
  assert.equal(duplicateSignup.response.status, 409);

  const meOne = await request(baseUrl, "/api/auth/me", {}, sessionOne);
  const protectedOne = await request(baseUrl, "/api/protected", {}, sessionOne);
  assert.equal(meOne.response.status, 200);
  assert.equal(protectedOne.body.organization.id, meOne.body.user.organization.id);

  const logoutCsrf = await request(baseUrl, "/api/auth/csrf-token", {}, sessionOne);
  const logout = await request(baseUrl, "/api/auth/logout", {
    method: "POST",
    headers: { "x-csrf-token": logoutCsrf.body.csrfToken },
  }, sessionOne);
  assert.equal(logout.response.status, 204);
  assert.equal((await request(baseUrl, "/api/auth/me", {}, sessionOne)).response.status, 401);

  const loginSession = (await request(baseUrl, "/api/auth/csrf-token")).cookie;
  const loginCsrf = (await request(baseUrl, "/api/auth/csrf-token", {}, loginSession)).body.csrfToken;
  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": loginCsrf },
    body: JSON.stringify({ email: emailOne, password: "password-one" }),
  }, loginSession);
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.organization.id, meOne.body.user.organization.id);

  const badLoginSession = (await request(baseUrl, "/api/auth/csrf-token")).cookie;
  const badLoginCsrf = (await request(baseUrl, "/api/auth/csrf-token", {}, badLoginSession)).body.csrfToken;
  const badLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": badLoginCsrf },
    body: JSON.stringify({ email: emailOne, password: "wrong-one" }),
  }, badLoginSession);
  assert.equal(badLogin.response.status, 401);
  assert.equal(badLogin.body.error, "Invalid email or password.");

  const sessionTwo = (await request(baseUrl, "/api/auth/csrf-token")).cookie;
  const csrfTwo = (await request(baseUrl, "/api/auth/csrf-token", {}, sessionTwo)).body.csrfToken;
  const signupTwo = await request(baseUrl, "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfTwo },
    body: JSON.stringify({ email: emailTwo, password: "password-two", organizationName: "Organization Two" }),
  }, sessionTwo);
  assert.equal(signupTwo.response.status, 201);
  assert.notEqual(signupTwo.body.user.organization.id, meOne.body.user.organization.id);
});
