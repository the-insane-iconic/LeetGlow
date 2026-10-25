// supabase/functions/create-order/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { name, email, phone } = await req.json();

    const rzpKeyId = Deno.env.get("RAZORPAY_KEY_ID") || "rzp_test_placeholder";
    const rzpSecret = Deno.env.get("RAZORPAY_KEY_SECRET") || "";

    // ₹29.00 = 2900 paise
    const amount = 2900;
    const currency = "INR";
    const receipt = `rcpt_${Date.now()}`;

    // Create order with Razorpay Orders API
    const authHeader = "Basic " + btoa(`${rzpKeyId}:${rzpSecret}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt,
        notes: {
          customer_name: name,
          customer_email: email,
          customer_phone: phone || "",
          product: "LeetGlow Premium",
        },
      }),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.json();
      throw new Error(err.error?.description || "Failed to create Razorpay order");
    }

    const orderData = await rzpRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
        key_id: rzpKeyId,
      }),
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
