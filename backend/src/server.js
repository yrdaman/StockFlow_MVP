import { createApp } from "./app.js";
import { PrismaClient } from "@prisma/client";

const port = Number(process.env.PORT) || 3000;
const app = createApp(new PrismaClient());

app.listen(port, () => {
  console.log(`StockFlow backend listening on port ${port}`);
});
