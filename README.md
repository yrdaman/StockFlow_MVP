# StockFlow_MVP

A minimal SaaS inventory management application built with React, Node.js, Express, Prisma, and SQLite.

## Local development

Install dependencies:

```bash
cd backend
npm install
copy .env.example .env
npx prisma migrate dev --name init

cd ..\frontend
npm install
copy .env.example .env
```

Start the backend:

```bash
cd backend
npm run dev
```

The backend health check is available at `http://localhost:3000/health`.
Authentication uses a SQLite-backed server-side session cookie. For local development,
keep `NODE_ENV=development`, set `FRONTEND_ORIGIN=http://localhost:5173`, and use a
long random `SESSION_SECRET`. Set `VITE_API_URL` in the frontend `.env` if the backend
uses a different URL.

For production, set a strong `SESSION_SECRET`, `NODE_ENV=production`,
`FRONTEND_ORIGIN` to the exact deployed frontend origin, and serve the backend over
HTTPS because the session cookie is secure in production.

In another terminal, start the frontend:

```bash
cd frontend
npm run dev
```

## Product API

All product endpoints require the authenticated session cookie. State-changing
requests also require the CSRF token from `GET /api/auth/csrf-token`.

- `GET /api/products?search=term` — list organization products, optionally searching name or SKU
- `GET /api/products/:id` — retrieve one organization product
- `POST /api/products` — create a product
- `PUT /api/products/:id` — update product details and quantity
- `PATCH /api/products/:id/quantity` — update quantity
- `DELETE /api/products/:id` — delete a product

Product responses include the backend-computed `effectiveThreshold` and
`isLowStock` values. Low stock uses the product threshold, then the
organization default threshold, then `5`.

## Dashboard API

- `GET /api/dashboard` — returns organization-scoped product totals, total
  quantity, low-stock count, and low-stock products

Dashboard responses include backend-computed effective thresholds. Low stock
uses the product threshold, then the organization default threshold, then `5`,
with products classified as low stock when `quantity <= effectiveThreshold`.
