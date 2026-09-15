"use client";

import Script from "next/script";
import { useState } from "react";
import { paymentsApi, ApiRequestError } from "@/lib/api/client";

type Props = {
  registrationId: string;
  amountPaise: number;
  /** Supabase auth.uid() — sent to FastAPI for ownership verification. */
  supabaseUserId: string;
  buttonLabel?: string;
  onPaid?: () => void;
  onError?: (message: string) => void;
};

type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

/**
 * Maps raw API/runtime errors into safe, sanitized user-friendly messages.
 * Never leaks internal backend details like service role keys, JWT errors, or SQL errors.
 */
function mapPaymentError(err: unknown): string {
  if (process.env.NODE_ENV !== "production") {
    console.error("[RazorpayCheckout payment error]:", err);
  }

  if (err instanceof ApiRequestError) {
    if (err.status === 401 || err.status === 403) {
      return "Please sign in again.";
    }
    if (err.status === 409) {
      return "Payment already completed.";
    }
    if (err.status === 400) {
      const msg = err.message.toLowerCase();
      if (msg.includes("registration_closed") || msg.includes("deadline")) {
        return "Registration deadline has passed.";
      }
      if (msg.includes("tournament_full") || msg.includes("slots")) {
        return "Tournament is already full.";
      }
      return "Unable to process payment request. Please try again.";
    }
    return "Something went wrong while starting payment. Please try again.";
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("jwt")) {
      return "Please sign in again.";
    }
    if (msg.includes("409") || msg.includes("already")) {
      return "Payment already completed.";
    }
    if (
      msg.includes("service role") ||
      msg.includes("supabase") ||
      msg.includes("sql") ||
      msg.includes("internal") ||
      msg.includes("syntax") ||
      msg.includes("postgres")
    ) {
      return "Something went wrong while starting payment. Please try again.";
    }
  }

  return "Something went wrong while starting payment. Please try again.";
}

export function RazorpayCheckout({
  registrationId,
  amountPaise,
  supabaseUserId,
  buttonLabel,
  onPaid,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startPayment = async () => {
    setBusy(true);
    setErrorMsg(null);

    try {
      // 1. Create Razorpay order via FastAPI: POST http://127.0.0.1:8000/api/v1/payments/create-order
      const order = await paymentsApi.createOrder({
        registration_id: registrationId,
        amount_paise: amountPaise,
        user_id: supabaseUserId,
      });

      if (!order.order_id || !order.key_id) {
        throw new Error("Could not create payment order.");
      }

      // 2. Open Razorpay checkout
      if (!window.Razorpay) {
        throw new Error("Payment checkout is still loading — please try again in a moment.");
      }

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "Brackify Arena",
        description: "Tournament entry fee",
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        handler: async (result: RazorpayResult) => {
          // 3. Verify payment signature via FastAPI: POST http://127.0.0.1:8000/api/v1/payments/verify
          try {
            const verified = await paymentsApi.verify({
              registration_id: registrationId,
              razorpay_order_id: result.razorpay_order_id,
              razorpay_payment_id: result.razorpay_payment_id,
              razorpay_signature: result.razorpay_signature,
              user_id: supabaseUserId,
            });

            if (!verified.paid) {
              const msg = "Payment verification failed. Please check your bank status.";
              setErrorMsg(msg);
              onError?.(msg);
              setBusy(false);
              return;
            }

            setErrorMsg(null);
            setBusy(false);
            onPaid?.();
          } catch (verifyErr) {
            const msg = mapPaymentError(verifyErr);
            setErrorMsg(msg);
            onError?.(msg);
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
          },
        },
      });

      checkout.open();
    } catch (err) {
      const msg = mapPaymentError(err);
      setErrorMsg(msg);
      onError?.(msg);
      setBusy(false);
    }
  };

  const rupees = (amountPaise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  });

  return (
    <div>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <button
        type="button"
        className="btn-primary px-4 py-2 text-xs font-semibold"
        disabled={busy}
        onClick={() => void startPayment()}
      >
        {busy ? "Processing…" : (buttonLabel ?? `Pay ${rupees}`)}
      </button>
      {errorMsg ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-arena-danger">
          <span>{errorMsg}</span>
          <button
            type="button"
            className="text-red-400 hover:text-red-200"
            onClick={() => setErrorMsg(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}