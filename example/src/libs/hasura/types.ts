// Hasura subscription event payload shape
export interface HasuraEvent<T = Record<string, any>> {
  id: string;
  created_at: string;
  trigger: {
    name: string;
  };
  table: {
    schema: string;
    name: string;
  };
  event: {
    session_variables: Record<string, string>;
    op: "INSERT" | "UPDATE" | "DELETE" | "MANUAL";
    data: {
      old: T | null;
      new: T | null;
    };
  };
}

// What we publish to SentryBus
export interface BusEvent {
  type: string;
  correlationId?: string;
  payload: Record<string, any>;
}

// Hasura GraphQL subscription message types
export interface SubscriptionData<T = Record<string, any>> {
  data: T;
}

export interface HasuraSubscriptionConfig {
  query: string;
  variables?: Record<string, any>;
  topic: string; // the SentryBus topic to publish to
}
