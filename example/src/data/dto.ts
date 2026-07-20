// Product DTOs
export interface ProductDto {
  id: string;
  title: string;
  price: string;
  createdAt: Date;
  updatedAt: Date;
}

// Order Item DTO — returns full product object instead of just productId
export interface OrderItemDto {
  id: string;
  orderId: string;
  product: ProductDto;
  quantity: string;
}

// Order DTO
export interface OrderDto {
  id: string;
  total: string;
  customerName: string;
  customerContact: string;
  customerAddress: string;
  customerNotes: string | null;
  orderStatus: string;
  items: OrderItemDto[];
  createdAt: Date;
  updatedAt: Date;
}

// Paginated response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
