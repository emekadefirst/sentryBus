import { Elysia, t } from "elysia";
import { orderRepository } from "../repos/order.repository";
import { createOrderSchema, updateOrderSchema, orderFilterSchema } from "../data/schema";
import { paymentService } from "../payment/service";

export const orderHandler = new Elysia({ prefix: "/orders" })
  // GET /orders?page=1&limit=10&search=foo&status=pending
  .get("/", async ({ query }) => {
    const filters = orderFilterSchema.parse(query);
    return orderRepository.findAll(filters);
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      search: t.Optional(t.String()),
      status: t.Optional(t.String()),
    }),
  })

  // GET /orders/:id
  .get("/:id", async ({ params, set }) => {
    const order = await orderRepository.findById(params.id);
    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }
    return order;
  }, {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
  })

  // POST /orders — creates order, initiates payment, publishes to bus
  .post("/", async ({ body, set }) => {
    const data = createOrderSchema.parse(body);
    const order = await orderRepository.create(data);

    // Initiate payment with Paystack + publish to SentryBus
    const payment = await paymentService.initiatePayment(order.id);

    set.status = 201;
    return {
      order,
      payment,
    };
  }, {
    body: t.Object({
      customerName: t.String({ minLength: 1, maxLength: 255 }),
      customerContact: t.String({ minLength: 1, maxLength: 255 }),
      customerAddress: t.String({ minLength: 1, maxLength: 500 }),
      customerNotes: t.Optional(t.String({ maxLength: 1000 })),
      items: t.Array(t.Object({
        productId: t.String({ format: "uuid" }),
        quantity: t.String({ pattern: "^\\d+(\\.\\d{1,2})?$" }),
      }), { minItems: 1 }),
    }),
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
  }, {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
    body: t.Object({
      customerName: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      customerContact: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      customerAddress: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
      customerNotes: t.Optional(t.String({ maxLength: 1000 })),
      orderStatus: t.Optional(t.String({ maxLength: 50 })),
    }),
  })

  // DELETE /orders/:id
  .delete("/:id", async ({ params, set }) => {
    const deleted = await orderRepository.delete(params.id);
    if (!deleted) {
      set.status = 404;
      return { error: "Order not found" };
    }
    set.status = 204;
  }, {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
  });
