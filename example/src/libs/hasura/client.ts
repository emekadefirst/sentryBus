import { FetchClient } from "../http/core";
import { hasuraConfig } from "../../configs/env";
import type { HasuraEvent, BusEvent, HasuraSubscriptionConfig, SubscriptionData } from "./types";

const BUS_URL = process.env.URL ?? "http://localhost:8085";

export class HasuraClient {
  protected client: FetchClient;

  constructor() {
    this.client = new FetchClient(hasuraConfig.url, {
      headers: {
        "x-hasura-admin-secret": hasuraConfig.adminSecret,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Execute a GraphQL query/mutation against Hasura
   */
  async query<T = any>(gql: string, variables: Record<string, any> = {}): Promise<T> {
    const response = await this.client.post("/v1/graphql", {
      body: { query: gql, variables },
    });

    if (!response.ok) {
      throw new Error(`Hasura query failed: ${JSON.stringify(response.data)}`);
    }

    if (response.data.errors) {
      throw new Error(`Hasura GQL error: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data as T;
  }

  /**
   * Handle incoming Hasura event trigger webhook.
   * Transforms the event into a SentryBus publish call.
   */
  async handleEventTrigger(event: HasuraEvent, topic: string): Promise<void> {
    const busEvent: BusEvent = {
      type: topic,
      correlationId: event.id,
      payload: {
        table: event.table.name,
        operation: event.event.op,
        data: event.event.data,
        trigger: event.trigger.name,
        timestamp: event.created_at,
      },
    };

    await this.publishToBus(busEvent);
  }

  /**
   * Subscribe to Hasura via WebSocket (GraphQL subscriptions).
   * On each subscription message, publishes the data to SentryBus.
   */
  subscribeAndForward(config: HasuraSubscriptionConfig): WebSocket {
    const wsUrl = hasuraConfig.url
      .replace("http://", "ws://")
      .replace("https://", "wss://")
      + "/v1/graphql";

    const ws = new WebSocket(wsUrl, "graphql-ws");

    ws.onopen = () => {
      // Init connection
      ws.send(JSON.stringify({
        type: "connection_init",
        payload: {
          headers: {
            "x-hasura-admin-secret": hasuraConfig.adminSecret,
          },
        },
      }));

      // Start subscription
      ws.send(JSON.stringify({
        id: "1",
        type: "start",
        payload: {
          query: config.query,
          variables: config.variables ?? {},
        },
      }));

      console.log(`[Hasura] Subscription started for topic: ${config.topic}`);
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(String(event.data));

      if (message.type === "data") {
        const subscriptionData: SubscriptionData = message.payload;
        const busEvent: BusEvent = {
          type: config.topic,
          payload: subscriptionData.data,
        };

        await this.publishToBus(busEvent);
      }
    };

    ws.onerror = (error) => {
      console.error("[Hasura] WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("[Hasura] WebSocket closed, reconnecting in 5s...");
      setTimeout(() => this.subscribeAndForward(config), 5000);
    };

    return ws;
  }

  /**
   * Publish an event to SentryBus via POST /publish
   */
  private async publishToBus(event: BusEvent): Promise<void> {
    const response = await fetch(`${BUS_URL}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error(`[Hasura→Bus] Failed to publish: ${response.status}`, await response.text());
    } else {
      const result = await response.json() as { dispatchedTo: number };
      console.log(`[Hasura→Bus] Published ${event.type} → dispatched to ${result.dispatchedTo} adapter(s)`);
    }
  }
}

export const hasuraClient = new HasuraClient();
