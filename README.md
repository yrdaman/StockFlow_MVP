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
