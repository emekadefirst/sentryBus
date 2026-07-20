import { eq, ilike, sql, count } from "drizzle-orm";
import { db } from "../data/db";
import { Product } from "../data/models";
import type { PaginatedResponse, ProductDto } from "../data/dto";

export class ProductRepository {
  async findAll(filters: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<PaginatedResponse<ProductDto>> {
    const { page, limit, search } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(ilike(Product.title, `%${search}%`));
    }

    const where = conditions.length > 0 ? conditions[0] : undefined;

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(Product)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(Product.createdAt),
      db
        .select({ count: count() })
        .from(Product)
        .where(where),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: items as ProductDto[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<ProductDto | null> {
    const result = await db
      .select()
      .from(Product)
      .where(eq(Product.id, id))
      .limit(1);

    return (result[0] as ProductDto) ?? null;
  }

  async create(data: { title: string; price: string }): Promise<ProductDto> {
    const result = await db.insert(Product).values(data).returning();
    return result[0] as ProductDto;
  }

  async update(
    id: string,
    data: { title?: string; price?: string }
  ): Promise<ProductDto | null> {
    const result = await db
      .update(Product)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(Product.id, id))
      .returning();

    return (result[0] as ProductDto) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(Product)
      .where(eq(Product.id, id))
      .returning();

    return result.length > 0;
  }
}

export const productRepository = new ProductRepository();
