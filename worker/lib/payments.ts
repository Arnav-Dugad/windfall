import type { Bindings } from "../env";

/**
 * Payment integration point.
 *
 * Windfall records every gift in its internal ledger (see ledger.ts). A PaymentProvider is asked to
 * authorize/collect funds *before* the ledger batch runs, and to refund if the ledger rejects it.
 *
 *  - PAYMENTS_MODE=demo (default): DemoLedgerProvider — no money moves, a `demo_` reference is returned.
 *  - PAYMENTS_MODE=stripe_test:    StripeConnectProvider — Stripe test mode, destination charges to the
 *    Seeker's connected account. Requires STRIPE_SECRET_KEY (sk_test_…) and a connected account id per Seeker.
 */
export interface ChargeInput {
  giftId: string;
  amountCents: number;
  patronId: string;
  requestId: string;
  /** Stripe connected account (acct_…) for the Seeker; unused in demo mode. */
  destinationAccount?: string | null;
}

export interface PaymentProvider {
  readonly mode: "demo" | "stripe_test";
  charge(input: ChargeInput): Promise<{ reference: string }>;
  refund(reference: string): Promise<void>;
}

export class DemoLedgerProvider implements PaymentProvider {
  readonly mode = "demo" as const;
  async charge(input: ChargeInput) {
    return { reference: `demo_${input.giftId}` };
  }
  async refund() {}
}

export class StripeConnectProvider implements PaymentProvider {
  readonly mode = "stripe_test" as const;
  private readonly secretKey: string;
  constructor(secretKey: string) {
    if (!secretKey.startsWith("sk_test_")) throw new Error("StripeConnectProvider only accepts test-mode keys");
    this.secretKey = secretKey;
  }

  private async call(path: string, params: Record<string, string>, idempotencyKey: string) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
      },
      body: new URLSearchParams(params),
    });
    const body = (await res.json()) as { id?: string; error?: { message: string } };
    if (!res.ok || !body.id) throw new Error(body.error?.message ?? `Stripe ${path} failed`);
    return body.id;
  }

  async charge(input: ChargeInput) {
    const params: Record<string, string> = {
      amount: String(input.amountCents),
      currency: "usd",
      confirm: "true",
      payment_method: "pm_card_visa", // test card; a real flow would collect a PaymentMethod client-side
      "automatic_payment_methods[enabled]": "true",
      "automatic_payment_methods[allow_redirects]": "never",
      "metadata[gift_id]": input.giftId,
      "metadata[request_id]": input.requestId,
      "metadata[patron_id]": input.patronId,
    };
    if (input.destinationAccount) params["transfer_data[destination]"] = input.destinationAccount;
    const id = await this.call("payment_intents", params, `gift-${input.giftId}`);
    return { reference: id };
  }

  async refund(reference: string) {
    await this.call("refunds", { payment_intent: reference }, `refund-${reference}`);
  }
}

export function paymentProvider(env: Bindings): PaymentProvider {
  if (env.PAYMENTS_MODE === "stripe_test" && env.STRIPE_SECRET_KEY) {
    return new StripeConnectProvider(env.STRIPE_SECRET_KEY);
  }
  return new DemoLedgerProvider();
}
