import { pgTable, varchar, timestamp, decimal, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const Product = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const Order = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerContact: varchar("customer_contact", { length: 255 }).notNull(),
  customerAddress: varchar("customer_address", { length: 500 }).notNull(),
  customerNotes: varchar("customer_notes", { length: 1000 }),
  orderStatus: varchar("order_status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const OrderItem = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => Order.id),
  productId: uuid("product_id").notNull().references(() => Product.id),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
});

// Relations
export const orderRelations = relations(Order, ({ many }) => ({
  items: many(OrderItem),
}));

export const orderItemRelations = relations(OrderItem, ({ one }) => ({
  order: one(Order, {
    fields: [OrderItem.orderId],
    references: [Order.id],
  }),
  product: one(Product, {
    fields: [OrderItem.productId],
    references: [Product.id],
  }),
}));

export const productRelations = relations(Product, ({ many }) => ({
  orderItems: many(OrderItem),
}));
