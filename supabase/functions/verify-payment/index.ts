// supabase/functions/verify-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: Verify HMAC-SHA256 signature
async function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payloadData = encoder.encode(`${orderId}|${paymentId}`);
  const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, payloadData);
  const computedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSignature === signature;
}

// Helper: Send Transactional Email via EmailJS
async function sendKeyEmail(email: string, name: string, key: string, orderId?: string) {
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID");
  const templateId = Deno.env.get("EMAILJS_TEMPLATE_ID");
  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY");
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY");

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    console.warn("[EmailJS] Missing EmailJS configuration secrets in environment variables.");
    return;
  }

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
      console.error("[EmailJS Error] Failed to send email:", res.status, errText);
    } else {
      console.log(`[EmailJS] License key successfully emailed to ${email}`);
    }
  } catch (err) {
    console.error("[EmailJS Exception]", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { name, email, phone, order_id, payment_id, signature, device_id } = await req.json();

    const rzpSecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (rzpSecret) {
      const isValid = await verifyRazorpaySignature(order_id, payment_id, signature, rzpSecret);
      if (!isValid) {
        throw new Error("Invalid Razorpay payment signature");
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call stored procedure to safely record payment, hash key, and activate device
    const { data, error } = await supabase.rpc("process_successful_payment", {
      p_name: name,
      p_email: email,
      p_phone: phone || "",
      p_order_id: order_id,
      p_payment_id: payment_id,
      p_device_id: device_id || "",
    });

    if (error) {
      throw error;
    }

    // Send the license key via EmailJS transactional email
    if (data && data.key) {
      await sendKeyEmail(email, name, data.key, order_id);
    }

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
