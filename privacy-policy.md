# Privacy Policy for LeetGlow

**Effective Date:** October 25, 2026  
**Last Updated:** October 25, 2026

**LeetGlow** ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how information is collected, used, and safeguarded when you install and use the **LeetGlow** Chrome Extension ("Extension").

---

## 1. Overview & Single Purpose

LeetGlow is an aesthetic customisation extension designed exclusively for LeetCode (`leetcode.com` and `leetcode.cn`). It allows developers to customize their coding environment with curated themes, background wallpapers, ambient soundtracks, and celebration sound effects.

We believe in strict data minimization. **We do not collect, read, store, or transmit your code solutions, LeetCode passwords, keystrokes, or general browsing history.**

---

## 2. Information We Collect

### A. Information Stored Locally on Your Device
- **Preferences & Settings:** Your chosen theme, background opacity, blur, custom uploaded wallpaper data (stored in local browser storage), and sound volume preferences are stored strictly inside your browser via the `chrome.storage` API. This data never leaves your device unless synced across your own Chrome instances via Chrome Sync.

### B. Information Collected During Premium Purchases
If you choose to purchase **LeetGlow Premium** (₹29 lifetime access), transactions are securely processed through **Razorpay** and verified via our secure backend powered by **Supabase**.
- **Contact & Billing Info:** Full name, email address, and phone number provided during checkout.
- **Transaction Records:** Razorpay Order ID, Payment ID, payment timestamp, and transaction status (`captured`).
- **Device & License Identifiers:** A randomly generated anonymous device identifier (`device_id`) and your 16-character license key (`LG-XXXX-XXXX-XXXX`) used to bind and restore your premium license across up to 3 authorized devices.

*Note: We never have access to, nor do we store, your credit/debit card numbers, UPI PINs, CVVs, or banking credentials. All sensitive payment details are processed directly within Razorpay's PCI-DSS compliant infrastructure.*

---

## 3. How We Use Information

The minimal information collected is used solely to:
1. Apply your customized theme and audio settings on supported LeetCode pages.
2. Verify payment completion and issue your 16-character license key.
3. Deliver your license key to your provided email address via our transactional email provider (Resend).
4. Provide customer support when you contact `anupamyadav6477@gmail.com`.

---

## 4. Permissions & Justification

LeetGlow requests only the minimum Chrome permissions required for core functionality:

| Permission | Justification |
|---|---|
| `storage` | Saves your custom theme choices, slider adjustments, sound settings, and local license entitlement status. |
| `sidePanel` | Displays the LeetGlow Studio control panel alongside LeetCode problems without cluttering or obstructing your code editor. |
| `offscreen` | Facilitates audio playback (ambient lofi soundtracks and submission celebration sound effects) in compliance with Manifest V3 background service worker policies. |
| `host_permissions` (`*.supabase.co`, `*.razorpay.com`) | Securely verifies lifetime license keys, processes Razorpay checkout modals, and unlocks premium wallpapers. |

---

## 5. Third-Party Service Providers

We partner only with reputable, enterprise-grade infrastructure providers:
- **Razorpay:** Payment gateway processing UPI, cards, and netbanking. ([Razorpay Privacy Policy](https://razorpay.com/privacy/))
- **Supabase:** Hosted PostgreSQL database and Edge Functions for license key generation and entitlement verification. ([Supabase Privacy Policy](https://supabase.com/privacy))
- **Resend:** Transactional email delivery to send you your purchased license key. ([Resend Privacy Policy](https://resend.com/privacy))

We do **not** sell, rent, monetize, or share your personal data with advertisers or data brokers.

---

## 6. Data Security

All communications between the Extension, Supabase Edge Functions, and Razorpay are encrypted in transit using industry-standard Transport Layer Security (TLS/HTTPS). All license keys are hashed using SHA-256 in our database with Row-Level Security (RLS) enabled.

---

## 7. Your Rights & Data Deletion

You can clear all locally stored theme settings at any time by uninstalling the extension or clearing extension data via `chrome://extensions/`. To request the deletion of your purchase record or email address from our verification database, simply email `anupamyadav6477@gmail.com`.

---

## 8. Contact Us

If you have any questions or concerns regarding this Privacy Policy, please contact:
- **Developer:** Anupam Yadav
- **Support Email:** [anupamyadav6477@gmail.com](mailto:anupamyadav6477@gmail.com)
