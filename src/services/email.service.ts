import { env } from '../config/env';
import { sendEmailJs, isEmailJsConfigured, EmailJsError } from '../lib/emailjs';

// KokTable-specific email helpers. The actual EmailJS client (src/lib/emailjs.ts)
// is generic/reusable — this file just supplies our template params and keeps the
// "best effort, never throw" behavior invite emails want (a failed send shouldn't
// fail the approve/resend request that triggered it).
//
// Add more helpers the same way for future email kinds (password reset, welcome,
// etc.) — either point each at its own EmailJS template via `templateId`, or reuse
// one template with a `kind`/`heading` param and branch inside it.

export async function sendMerchantInviteEmail(to: string, restaurantName: string, inviteUrl: string): Promise<void> {
  if (env.nodeEnv !== 'production') {
    console.log(`[email.service] merchant invite link for ${to} (${restaurantName}): ${inviteUrl}`);
  }

  if (!isEmailJsConfigured(env.emailjs)) {
    console.warn('[email.service] EmailJS not configured — skipping invite email send.');
    return;
  }

  try {
    await sendEmailJs(env.emailjs, {
      templateParams: {
        to_email: to,
        restaurant_name: restaurantName,
        invite_url: inviteUrl,
      },
    });
  } catch (err) {
    if (err instanceof EmailJsError) {
      console.error(`[email.service] EmailJS send failed: ${err.status ?? ''} ${err.body ?? err.message}`);
    } else {
      console.error('[email.service] EmailJS send threw:', err);
    }
  }
}
