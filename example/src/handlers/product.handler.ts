import { Elysia, t } from "elysia";
import { productRepository } from "../repos/product.repository";
import { createProductSchema, updateProductSchema, productFilterSchema } from "../data/schema";

export const productHandler = new Elysia({ prefix: "/products" })
  // GET /products?page=1&limit=10&search=foo
  .get("/", async ({ query }) => {
    const filters = productFilterSchema.parse(query);
    return productRepository.findAll(filters);
  })

  // GET /products/:id
  .get("/:id", async ({ params, set }) => {
    const product = await productRepository.findById(params.id);
    if (!product) {
      set.status = 404;
      return { error: "Product not found" };
    }
    return product;
  })

  // POST /products
  .post("/", async ({ body, set }) => {
    const data = createProductSchema.parse(body);
    set.status = 201;
    return productRepository.create(data);
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
  })

  // DELETE /products/:id
  .delete("/:id", async ({ params, set }) => {
    const deleted = await productRepository.delete(params.id);
    if (!deleted) {
      set.status = 404;
      return { error: "Product not found" };
    }
    set.status = 204;
  });
