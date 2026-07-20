import type { Payload, Response, WHResponse } from "./types";
import { FetchClient } from "../http/core";
import { paysatckConfig } from "../../configs/env";
import crypto from "crypto";


export class PaystackClient {
    protected client: FetchClient;
    constructor() {
        this.client = new FetchClient(paysatckConfig.url as string, {
            headers: {
                "Authorization": `Bearer ${paysatckConfig.secretKey}`,
                "Content-Type": "application/json"
            },
        });
    }

    async inipayment(data: Payload): Promise<Response> {
        try {
            const response = await this.client.post("/transaction/initialize", data);
            if (!response.ok) {
                return { message: response.data?.message ?? "Payment initialization failed" };
            }
            return {
                url: response.data.data.authorization_url,
                reference: response.data.data.reference
            };

        } catch (error) {
            throw new Error(`failed payment: ${(error as Error).message}`);
        }
    }

    verifyOrigin(body: string, signature: string): boolean {
        const hash = crypto
            .createHmac("sha512", paysatckConfig.secretKey as string)
            .update(body)
            .digest("hex");
        return hash === signature;
    }

    async manualVerify(reference: string): Promise<Response> {
        try {
            const response = await this.client.get(`/transaction/verify/${reference}`);
            if (!response.ok) {
                return { message: "Verification failed" };
            }
            return {
                status: response.data.status,
                reference: response.data.reference
            };
        } catch (error) {
            throw new Error(`manual verification failed: ${(error as Error).message}`);
        }
    }

    wbHandler(body: string, signature: string): WHResponse | null {
        if (!this.verifyOrigin(body, signature)) {
            return null;
        }

        const event = JSON.parse(body);
        return {
            event: event.event,
            reference: event.data.reference,
        };
    }
}



