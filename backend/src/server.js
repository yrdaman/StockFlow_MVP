import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;

const { PrismaClient } = process.env.NODE_ENV === "production"
  ? await import("../generated/postgres-client/index.js")
  : await import("@prisma/client");

const app = createApp(new PrismaClient());

app.listen(port, () => {
  console.log(`StockFlow backend listening on port ${port}`);
});
