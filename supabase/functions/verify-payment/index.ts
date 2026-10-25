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

// Helper: Send Transactional Email via Resend
async function sendKeyEmail(email: string, name: string, key: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.log("[Email] RESEND_API_KEY not configured. Key for", email, "is:", key);
    return;
  }

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LeetGlow <premium@leetglow.com>",
        to: email,
        subject: "Your LeetGlow Premium License Key 🌟",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0e0f17; color: #ecebf2; border-radius: 16px;">
            <h2 style="color: #f98dc1; margin-top: 0;">Welcome to LeetGlow Premium!</h2>
            <p>Hi ${name || "there"},</p>
            <p>Thank you for purchasing LeetGlow Premium. Your payment has been verified and your lifetime access is confirmed.</p>
            <div style="background: #181724; border: 1px dashed #a855f7; border-radius: 10px; padding: 16px 20px; text-align: center; margin: 24px 0;">
              <span style="display: block; font-size: 12px; text-transform: uppercase; color: #a3a0b3; letter-spacing: 0.1em; margin-bottom: 6px;">Your 16-Character License Key</span>
              <code style="font-size: 22px; font-weight: bold; color: #ffffff; letter-spacing: 2px;">${key}</code>
            </div>
            <p style="font-size: 13px; color: #a3a0b3; line-height: 1.6;">
              You can activate this key on up to <strong>3 devices</strong>. Simply open Anime Studio in LeetGlow, click <strong>Activate Key</strong>, and paste your code.
            </p>
            <hr style="border: 0; border-top: 1px solid #2a2735; margin: 24px 0;" />
            <p style="font-size: 12px; color: #6f6b80;">LeetGlow · Themes, Sound Effects & Anime Backgrounds for LeetCode</p>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error("[Email Error]", err);
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

    // Send the license key via transactional email
    if (data && data.key) {
      await sendKeyEmail(email, name, data.key);
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
