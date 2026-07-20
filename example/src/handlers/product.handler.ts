import { Elysia, t } from "elysia";
import { productRepository } from "../repos/product.repository";
import { createProductSchema, updateProductSchema, productFilterSchema } from "../data/schema";

export const productHandler = new Elysia({ prefix: "/products" })
  // GET /products?page=1&limit=10&search=foo
  .get("/", async ({ query }) => {
    const filters = productFilterSchema.parse(query);
    return productRepository.findAll(filters);
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      search: t.Optional(t.String()),
    }),
  })

  // GET /products/:id
  .get("/:id", async ({ params, set }) => {
    const product = await productRepository.findById(params.id);
    if (!product) {
      set.status = 404;
      return { error: "Product not found" };
    }
    return product;
  }, {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
  })

  // POST /products
  .post("/", async ({ body, set }) => {
    const data = createProductSchema.parse(body);
    set.status = 201;
    return productRepository.create(data);
  }, {
    body: t.Object({
      title: t.String({ minLength: 1, maxLength: 255 }),
      price: t.String({ pattern: "^\\d+(\\.\\d{1,2})?$" }),
    }),
  })

  // PUT /products/:id
  .put("/:id", async ({ params, body, set }) => {
    const data = updateProductSchema.parse(body);
    const product = await productRepository.update(params.id, data);
    if (!product) {
      set.status = 404;
      return { error: "Product not found" };
    }
    return product;
  }, {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
    body: t.Object({
      title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      price: t.Optional(t.String({ pattern: "^\\d+(\\.\\d{1,2})?$" })),
    }),
  })

  // DELETE /products/:id
  .delete("/:id", async ({ params, set }) => {
    const deleted = await productRepository.delete(params.id);
    if (!deleted) {
      set.status = 404;
      return { error: "Product not found" };
    }
    set.status = 204;
  }, {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
  });
