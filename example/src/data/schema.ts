import { z } from "zod";

// Product schemas
export const createProductSchema = z.object({
  title: z.string().min(1).max(255),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
});

export const updateProductSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format").optional(),
});

// Order schemas
export const createOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid quantity format"),
});

export const createOrderSchema = z.object({
  customerName: z.string().min(1).max(255),
  customerContact: z.string().min(1).max(255),
  customerAddress: z.string().min(1).max(500),
  customerNotes: z.string().max(1000).optional(),
  items: z.array(createOrderItemSchema).min(1),
});

export const updateOrderSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  customerContact: z.string().min(1).max(255).optional(),
  customerAddress: z.string().min(1).max(500).optional(),
  customerNotes: z.string().max(1000).optional(),
  orderStatus: z.string().max(50).optional(),
});

// Query/filter schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const productFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
});

export const orderFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.string().optional(),
});
