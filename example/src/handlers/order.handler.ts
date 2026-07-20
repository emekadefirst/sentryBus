import { Elysia } from "elysia";
import { orderRepository } from "../repos/order.repository";
import { createOrderSchema, updateOrderSchema, orderFilterSchema } from "../data/schema";

export const orderHandler = new Elysia({ prefix: "/orders" })
  // GET /orders?page=1&limit=10&search=foo&status=pending
  .get("/", async ({ query }) => {
    const filters = orderFilterSchema.parse(query);
    return orderRepository.findAll(filters);
  })

  // GET /orders/:id
  .get("/:id", async ({ params, set }) => {
    const order = await orderRepository.findById(params.id);
    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }
    return order;
  })

  // POST /orders
  .post("/", async ({ body, set }) => {
    const data = createOrderSchema.parse(body);
    set.status = 201;
    return orderRepository.create(data);
  })

  // PUT /orders/:id
  .put("/:id", async ({ params, body, set }) => {
    const data = updateOrderSchema.parse(body);
    const order = await orderRepository.update(params.id, data);
    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }
    return order;
  })

  // DELETE /orders/:id
  .delete("/:id", async ({ params, set }) => {
    const deleted = await orderRepository.delete(params.id);
    if (!deleted) {
      set.status = 404;
      return { error: "Order not found" };
    }
    set.status = 204;
  });
