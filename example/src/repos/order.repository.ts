import { eq, ilike, or, count } from "drizzle-orm";
import { db } from "../data/db";
import { Order, OrderItem, Product } from "../data/models";
import type { PaginatedResponse, OrderDto, OrderItemDto } from "../data/dto";

export class OrderRepository {
  async findAll(filters: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }): Promise<PaginatedResponse<OrderDto>> {
    const { page, limit, search, status } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(Order.customerName, `%${search}%`),
          ilike(Order.customerContact, `%${search}%`)
        )!
      );
    }
    if (status) {
      conditions.push(eq(Order.orderStatus, status));
    }

    const where = conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : conditions.reduce((acc, cond) => acc ? or(acc, cond)! : cond)
      : undefined;

    const [orders, totalResult] = await Promise.all([
      db
        .select()
        .from(Order)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(Order.createdAt),
      db
        .select({ count: count() })
        .from(Order)
        .where(where),
    ]);

    const total = totalResult[0]?.count ?? 0;

    // Fetch items with product details for each order
    const ordersWithItems: OrderDto[] = await Promise.all(
      orders.map(async (order) => {
        const items = await this.getOrderItems(order.id);
        return {
          ...order,
          items,
        } as OrderDto;
      })
    );

    return {
      data: ordersWithItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<OrderDto | null> {
    const result = await db
      .select()
      .from(Order)
      .where(eq(Order.id, id))
      .limit(1);

    if (!result[0]) return null;

    const items = await this.getOrderItems(id);

    return {
      ...result[0],
      items,
    } as OrderDto;
  }

  async create(data: {
    customerName: string;
    customerContact: string;
    customerAddress: string;
    customerNotes?: string;
    items: { productId: string; quantity: string }[];
  }): Promise<OrderDto> {
    // Calculate total from items
    const products = await Promise.all(
      data.items.map((item) =>
        db.select().from(Product).where(eq(Product.id, item.productId)).limit(1)
      )
    );

    let total = 0;
    for (let i = 0; i < data.items.length; i++) {
      const productResult = products[i];
      const product = productResult?.[0];
      if (!product) throw new Error(`Product ${data.items[i]!.productId} not found`);
      total += parseFloat(product.price) * parseFloat(data.items[i]!.quantity);
    }

    // Create order
    const result = await db
      .insert(Order)
      .values({
        total: total.toFixed(2),
        customerName: data.customerName,
        customerContact: data.customerContact,
        customerAddress: data.customerAddress,
        customerNotes: data.customerNotes ?? null,
      })
      .returning();

    const order = result[0]!;

    // Create order items
    await db.insert(OrderItem).values(
      data.items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
      }))
    );

    return this.findById(order.id) as Promise<OrderDto>;
  }

  async update(
    id: string,
    data: {
      customerName?: string;
      customerContact?: string;
      customerAddress?: string;
      customerNotes?: string;
      orderStatus?: string;
    }
  ): Promise<OrderDto | null> {
    const result = await db
      .update(Order)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(Order.id, id))
      .returning();

    if (!result[0]) return null;

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    // Delete order items first
    await db.delete(OrderItem).where(eq(OrderItem.orderId, id));
    const result = await db.delete(Order).where(eq(Order.id, id)).returning();
    return result.length > 0;
  }

  private async getOrderItems(orderId: string): Promise<OrderItemDto[]> {
    const items = await db
      .select({
        id: OrderItem.id,
        orderId: OrderItem.orderId,
        quantity: OrderItem.quantity,
        product: {
          id: Product.id,
          title: Product.title,
          price: Product.price,
          createdAt: Product.createdAt,
          updatedAt: Product.updatedAt,
        },
      })
      .from(OrderItem)
      .innerJoin(Product, eq(OrderItem.productId, Product.id))
      .where(eq(OrderItem.orderId, orderId));

    return items as OrderItemDto[];
  }
}

export const orderRepository = new OrderRepository();
