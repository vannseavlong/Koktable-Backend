import { env } from '../config/env';

// Sending the merchant invite email is best-effort: it's a side effect of an admin's
// approve action, not the state change itself (the restaurant/invite rows are already
// committed by the time this runs), so a delivery failure shouldn't fail the request —
// it's logged instead. In non-production, the invite link is always console-logged too,
// so the flow is testable without real EmailJS credentials configured.
export async function sendMerchantInviteEmail(to: string, restaurantName: string, inviteUrl: string): Promise<void> {
  if (env.nodeEnv !== 'production') {
    console.log(`[email.service] merchant invite link for ${to} (${restaurantName}): ${inviteUrl}`);
  }

  const { serviceId, templateId, publicKey, privateKey } = env.emailjs;
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    console.warn('[email.service] EmailJS not configured — skipping invite email send.');
    return;
  }

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  serviceId,
        template_id: templateId,
        user_id:     publicKey,
        accessToken: privateKey,
        template_params: {
          to_email:   to,
          restaurant_name:  restaurantName,
          invite_url: inviteUrl,
        },
      }),
    });

    if (!res.ok) {
      console.error(`[email.service] EmailJS send failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('[email.service] EmailJS send threw:', err);
  }
}
