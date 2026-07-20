import { OrderRepository } from "../repos/order.repository";
import { PaystackClient } from "../libs/paystack/client";
import type { Response } from "../libs/paystack/types";
import type { writeOrderPayment } from "./types";

const orderRepo = new OrderRepository();
const paystack = new PaystackClient();

export class PaymentService {
  async initiatePayment(data: writeOrderPayment): Promise<Response> {
    const order = await orderRepo.findById(data.orderId);
    if (!order) {
      return { message: "Order not found" };
    }

    const result = await paystack.inipayment({
      email: data.email,
      amount: data.amount,
    });

    return result;
  }
}

export const paymentService = new PaymentService();
