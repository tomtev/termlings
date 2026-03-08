declare global {
  namespace App {
    interface Platform {
      env: {
        KV: KVNamespace;
        STRIPE_SECRET_KEY: string;
        STRIPE_WEBHOOK_SECRET: string;
        STRIPE_PRICE_ID: string;
      };
    }
  }
}

export {};
