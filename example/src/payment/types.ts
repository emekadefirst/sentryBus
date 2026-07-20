// This will be sent to blnk
export interface PaymentLog {
    email: string
    amount: number
    reference: string
    status: string
    createdAt: Date
    updatedAt: Date
}

export interface writeOrderPayment {
    email: string
    orderId: string
    amount: number
}