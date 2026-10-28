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
```

Start the backend:

```bash
cd backend
npm run dev
```

The backend health check is available at `http://localhost:3000/health`.

In another terminal, start the frontend:

```bash
cd frontend
npm run dev
```
