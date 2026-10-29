# StockFlow

**Live demo:** https://stockflow-mvp-jve2.onrender.com
Free tier: the first load may take about 50 seconds to wake up.

StockFlow is a small organization-based inventory management application. Users
can create an account, manage products, view inventory totals, identify
low-stock products, and configure an organization-wide default stock threshold.

## Features

- Account signup, login, logout, and session persistence
- Password hashing with bcrypt
- Server-side sessions
- CSRF protection for state-changing requests
- Organization-level data isolation
- Product inventory management
- Organization-scoped SKU uniqueness
- Product search by name or SKU
- Quantity, cost price, selling price, description, and low-stock threshold fields
- Dashboard with product totals, quantity totals, and low-stock products
- Organization default low-stock threshold settings
- Responsive React interface
- SQLite for local development
- PostgreSQL/Neon support for production

## Technology

- React and Vite
- Tailwind CSS
- Node.js and Express
- Prisma ORM
- SQLite locally
- PostgreSQL/Neon in production
- bcrypt
- Express server-side sessions

## Project structure

```text
backend/
  prisma/                 Local SQLite schema and migrations
  prisma-postgres/        Production PostgreSQL schema and migrations
  src/
    app.js                Express application and middleware
    auth.js               Authentication and session routes
    dashboard.js          Dashboard routes
    products.js           Product routes
    settings.js           Organization settings routes
    server.js             Production server entry point
  test/                   Backend automated tests

frontend/
  src/
    main.jsx              React application and API client
    style.css             Application styles
  vite.config.js          Vite configuration
```

## Local setup

From the repository root, install backend dependencies:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Configure `backend/.env`:

```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET="replace-with-a-long-random-secret-at-least-32-characters"
NODE_ENV="development"
FRONTEND_ORIGIN="http://localhost:5173"
```

Run the local SQLite migration:

```powershell
npx prisma migrate dev
```

Install frontend dependencies:

```powershell
cd ..\frontend
npm install
Copy-Item .env.example .env
```

The frontend `.env` normally contains:

```env
VITE_API_URL="http://localhost:3000"
```

Start the backend in one terminal:

```powershell
cd ..\backend
npm run dev
```

Start the frontend in another terminal:

```powershell
cd ..\frontend
npm run dev
```

Open the Vite URL shown in the terminal, normally:

```text
http://localhost:5173
```

The backend health check is available at:

```text
http://localhost:3000/health
```

It returns:

```json
{"status":"ok"}
```

## Authentication and sessions

Authentication uses an HTTP-only server-side session cookie named
`stockflow.sid`. The browser must send credentials with API requests.

The CSRF token endpoint is:

```text
GET /api/auth/csrf-token
```

The returned token must be sent in the `X-CSRF-Token` header for signup, login,
logout, product changes, and settings changes.

Authentication endpoints:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/csrf-token`

## Product API

Product endpoints require an authenticated session and organization context.
State-changing requests also require a valid CSRF token.

- `GET /api/products?search=term` — list organization products, optionally searching name or SKU
- `GET /api/products/:id` — retrieve one organization product
- `POST /api/products` — create a product
- `PUT /api/products/:id` — update product details and quantity
- `PATCH /api/products/:id/quantity` — update quantity
- `DELETE /api/products/:id` — delete a product

Products include backend-computed `effectiveThreshold` and `isLowStock` values.
The effective threshold is selected in this order:

1. Product-specific threshold
2. Organization default threshold
3. Fallback threshold of `5`

A product is low stock when its quantity is less than or equal to its effective
threshold.

## Dashboard and settings API

Dashboard:

- `GET /api/dashboard` — returns organization-scoped product count, total
  quantity, low-stock count, and low-stock products

Organization settings:

- `GET /api/settings` — returns the organization default threshold
- `PUT /api/settings` — updates the organization default threshold

Users can access only data belonging to their own organization. Organization
identifiers are taken from the authenticated session, not from request data.

## Database

Local development uses the SQLite schema at
`backend/prisma/schema.prisma` and stores the database in `backend/prisma/dev.db`.

Production uses the PostgreSQL schema at
`backend/prisma-postgres/schema.prisma`. Configure the production database
connection with `NEON_DATABASE_URL` and apply committed migrations with:

```powershell
cd backend
npx prisma migrate deploy --schema prisma-postgres/schema.prisma
```

Do not commit `.env` files, database files, or generated local session data.

## Production deployment

The backend can serve the built frontend from `frontend/dist`. To build the
frontend and generate the production Prisma client, configure the Render Web
Service with:

```text
Root Directory: backend
Build Command: npm install --include=dev && cd ../frontend && npm install --include=dev && npm run build && cd ../backend && npx prisma generate --schema prisma-postgres/schema.prisma
Start Command: npx prisma migrate deploy --schema prisma-postgres/schema.prisma && npm start
```

For the current same-origin deployment, open:

```text
https://stockflow-mvp-jve2.onrender.com
```

The backend service should have these environment variables configured:

```env
NODE_ENV=production
NEON_DATABASE_URL=your-production-postgresql-connection-string
SESSION_SECRET=your-long-random-production-secret
FRONTEND_ORIGIN=https://stockflow-mvp-jve2.onrender.com
```

The backend serves the frontend and API from the same origin. Leave
`VITE_API_URL` unset in the production build so the frontend uses relative
`/api` requests and the session cookie remains same-origin.

## Demo

Live demo account: `demo@stockflow.test` / `Demo12345`
(Or sign up with any email.)

## Out of Scope (per PRD)

Password reset, multi-user organizations, roles, CSV import, integrations, and
stock movement history.

## Verification

Run the backend test suite:

```powershell
cd backend
npm test
```

Build the frontend:

```powershell
cd frontend
npm run build
```

Check the production health endpoint:

```text
GET https://stockflow-mvp-jve2.onrender.com/health
```

The expected response is HTTP `200` with `{"status":"ok"}`.

## Security notes

- Keep `SESSION_SECRET` private and use a different strong value in production.
- Never commit `.env` files or database credentials.
- Production sessions require HTTPS because the session cookie is secure.
- Keep CORS origins restricted to known frontend origins.
- Do not disable CSRF protection to work around a request failure.
