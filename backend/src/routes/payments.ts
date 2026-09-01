import { createHmac } from "node:crypto";
import type { Request, Response, Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type PaymentRouterOptions = { router: Router; supabase?: SupabaseClient };
type OrderResponse = { id: string; amount: number; currency: string };

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const getUserId = (request: Request): string => {
  const userId = (request as Request & { user?: { id?: string } }).user?.id;
  if (!userId) throw new Error("Authentication required");
  return userId;
};

const razorpayRequest = async <T>(path: string, init: RequestInit): Promise<T> => {
  const keyId = required("RAZORPAY_KEY_ID");
  const keySecret = required("RAZORPAY_KEY_SECRET");
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Basic ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Razorpay request failed (${response.status})`);
  return response.json() as Promise<T>;
};

export function registerPaymentRoutes({ router, supabase: provided }: PaymentRouterOptions): Router {
  const supabase = provided ?? createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));

  router.post("/payments/create-order", async (request: Request, response: Response) => {
    try {
      const userId = getUserId(request);
      const { registrationId, amountPaise } = request.body as { registrationId?: string; amountPaise?: number };
      if (!registrationId || !Number.isInteger(amountPaise) || amountPaise <= 0) return response.status(400).json({ error: "Invalid payment details" });

      const { data: registration, error } = await supabase.from("tournament_registrations").select("id,tournament_id,payment_status").eq("id", registrationId).maybeSingle();
      if (error) throw error;
      if (!registration) return response.status(404).json({ error: "Registration not found" });
      if (registration.payment_status === "paid") return response.status(409).json({ error: "Registration is already paid" });

      const order = await razorpayRequest<OrderResponse>("/orders", { method: "POST", body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: `registration_${registrationId}`, notes: { registration_id: registrationId, user_id: userId } }) });
      const { error: paymentError } = await supabase.from("payments").insert({ registration_id: registrationId, user_id: userId, tournament_id: registration.tournament_id, amount_paise: amountPaise, razorpay_order_id: order.id, status: "created" });
      if (paymentError) throw paymentError;
      await supabase.from("tournament_registrations").update({ payment_status: "created", razorpay_order_id: order.id }).eq("id", registrationId);
      return response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: required("RAZORPAY_KEY_ID") });
    } catch (error) {
      console.error("[payments] order creation failed", error);
      return response.status(400).json({ error: error instanceof Error ? error.message : "Could not create payment order" });
    }
  });

  router.post("/payments/verify", async (request: Request, response: Response) => {
    try {
      const userId = getUserId(request);
      const { registrationId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = request.body as Record<string, string | undefined>;
      if (!registrationId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return response.status(400).json({ error: "Incomplete payment verification" });
      const expected = createHmac("sha256", required("RAZORPAY_KEY_SECRET")).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
      if (expected !== razorpaySignature) return response.status(400).json({ error: "Invalid payment signature" });
      const { data: payment, error } = await supabase.from("payments").select("id,user_id").eq("registration_id", registrationId).eq("razorpay_order_id", razorpayOrderId).maybeSingle();
      if (error) throw error;
      if (!payment || payment.user_id !== userId) return response.status(403).json({ error: "Payment does not belong to this user" });
      const paidAt = new Date().toISOString();
      const { error: paymentUpdateError } = await supabase.from("payments").update({ status: "paid", razorpay_payment_id: razorpayPaymentId, razorpay_signature: razorpaySignature, paid_at: paidAt, updated_at: paidAt }).eq("id", payment.id).neq("status", "paid");
      if (paymentUpdateError) throw paymentUpdateError;
      const { error: registrationError } = await supabase.from("tournament_registrations").update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId, razorpay_signature: razorpaySignature, paid_at: paidAt }).eq("id", registrationId);
      if (registrationError) throw registrationError;
      return response.json({ paid: true });
    } catch (error) {
      console.error("[payments] verification failed", error);
      return response.status(400).json({ error: error instanceof Error ? error.message : "Could not verify payment" });
    }
  });

  router.post("/payments/webhook", async (request: Request, response: Response) => {
    try {
      const signature = request.header("x-razorpay-signature");
      const payload = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
      const expected = createHmac("sha256", required("RAZORPAY_WEBHOOK_SECRET")).update(payload).digest("hex");
      if (!signature || signature !== expected) return response.status(401).json({ error: "Invalid webhook signature" });
      const event = request.body as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
      const entity = event.payload?.payment?.entity;
      if (entity?.id && entity.order_id && event.event === "payment.captured") {
        const paidAt = new Date().toISOString();
        const { data: payment } = await supabase.from("payments").select("id,registration_id").eq("razorpay_order_id", entity.order_id).maybeSingle();
        if (payment) {
          await supabase.from("payments").update({ status: "paid", razorpay_payment_id: entity.id, paid_at: paidAt, updated_at: paidAt }).eq("id", payment.id);
          await supabase.from("tournament_registrations").update({ payment_status: "paid", razorpay_payment_id: entity.id, paid_at: paidAt }).eq("id", payment.registration_id);
        }
      }
      return response.json({ received: true });
    } catch (error) {
      console.error("[payments] webhook failed", error);
      return response.status(400).json({ error: "Webhook processing failed" });
    }
  });
  return router;
}
