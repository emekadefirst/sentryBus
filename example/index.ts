import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { productHandler } from "./src/handlers/product.handler";
import { orderHandler } from "./src/handlers/order.handler";
import { paymentHandler } from "./src/payment/handler";

const app = new Elysia()
  .use(swagger({ path: "/docs" }))
  .use(productHandler)
  .use(orderHandler)
  .use(paymentHandler)
  .listen(3005);

console.log(`Server running at http://localhost:${app.server?.port}`);
