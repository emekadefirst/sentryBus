export interface Payload {
    email: string
    amount: number
}


export interface Response {
    status?: string
    url?: string
    message?: string
    reference?: string
}



export interface WHResponse {
    event: "charge.success"
    reference: string
}

