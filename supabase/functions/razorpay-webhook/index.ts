// supabase/functions/razorpay-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

// Helper: Send Transactional Email via EmailJS
async function sendKeyEmail(email: string, name: string, key: string, orderId?: string) {
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "service_zo3rrys";
  const templateId = Deno.env.get("EMAILJS_TEMPLATE_ID") || "template_s1jgrvc";
  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "lr-VJt44cVESpln8f";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "loLjzUSmwBA34U8ZGZF1s";

  const purchaseDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const payload: Record<string, any> = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    accessToken: privateKey,
    template_params: {
      email: email,
      to_email: email,
      name: name || "there",
      to_name: name || "there",
      key: key,
      license_key: key,
      activation_key: key,
      order_id: orderId || `ord_${Date.now()}`,
      purchase_date: purchaseDate,
      support_email: "anupamyadav6477@gmail.com",
    },
  };

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://dashboard.emailjs.com",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[EmailJS Webhook Error]", res.status, errText);
    } else {
      console.log(`[EmailJS Webhook] License key emailed to ${email}`);
    }
  } catch (err) {
    console.error("[EmailJS Webhook Exception]", err);
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    const bodyText = await req.text();

    // Verify webhook signature if secret configured
    if (webhookSecret && signature) {
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(bodyText));
      const computed = Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (computed !== signature) {
        return new Response("Invalid signature", { status: 400 });
      }
    }

    const event = JSON.parse(bodyText);
    const eventId = event.event_id || event.payload?.payment?.entity?.id || `evt_${Date.now()}`;
    const eventType = event.event;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Idempotency Check
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing) {
      // Already processed idempotently
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Process payment.captured event
    if (eventType === "payment.captured") {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;
      const email = paymentEntity.email;
      const contact = paymentEntity.contact;
      const name = paymentEntity.notes?.customer_name || "Valued Customer";

      const { data } = await supabase.rpc("process_successful_payment", {
        p_name: name,
        p_email: email,
        p_phone: contact || "",
        p_order_id: orderId || "",
        p_payment_id: paymentId,
        p_device_id: "",
      });

      if (data && data.key && email) {
        await sendKeyEmail(email, name, data.key, orderId);
      }
    }

    // 3. Record Webhook Event for idempotency
    await supabase.from("webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      payload: event,
    });

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[Webhook Error]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
