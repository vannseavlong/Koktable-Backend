/**
 * Minimal, dependency-free EmailJS REST API client.
 *
 * Portable by design: this module has zero project-specific knowledge (no
 * "restaurant", no "invite") — it just POSTs whatever `templateParams` you
 * give it to whichever EmailJS template you point it at. Copy this file
 * as-is into another project; only the config (service/template/public/
 * private key) and the template_params shape are project-specific, and both
 * live at the call site, not in here.
 *
 * EmailJS REST API docs: https://www.emailjs.com/docs/rest-api/send/
 */

const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';

export interface EmailJsConfig {
  /** EmailJS "Service ID" (Email Services tab). */
  serviceId?: string;
  /** Default template ID, used when a call doesn't pass its own `templateId`. */
  templateId?: string;
  /** EmailJS "Public Key" (Account → General). */
  publicKey?: string;
  /**
   * EmailJS "Private Key" (Account → General, aka `accessToken` on the wire).
   * Required for server-side sends — without it EmailJS rejects requests that
   * don't come from a browser Origin it recognizes.
   */
  privateKey?: string;
}

export interface SendEmailJsOptions {
  /**
   * Template variables, keyed exactly as referenced in the EmailJS template
   * editor (e.g. a `{{to_email}}` placeholder needs a `to_email` key here).
   * This is the "dynamic" part — any template, any shape of variables, same
   * client. EmailJS stringifies values on its end; pass primitives.
   */
  templateParams: Record<string, string | number | boolean>;
  /** Send with a different template than `config.templateId` for this call only. */
  templateId?: string;
  /** Send through a different service than `config.serviceId` for this call only. */
  serviceId?: string;
}

export class EmailJsError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: string) {
    super(message);
    this.name = 'EmailJsError';
  }
}

/** True once serviceId/templateId/publicKey/privateKey are all present — the minimum needed to attempt a send. */
export function isEmailJsConfigured(config: EmailJsConfig): boolean {
  return Boolean(config.serviceId && config.templateId && config.publicKey && config.privateKey);
}

/**
 * Sends one email via the EmailJS REST API.
 *
 * Throws `EmailJsError` on missing config, a non-2xx response, or a network
 * failure — it does not swallow errors itself. Callers that want "best
 * effort, never throw" behavior (e.g. a non-critical notification email)
 * should catch and log; callers that want the failure to propagate can let
 * it bubble.
 */
export async function sendEmailJs(config: EmailJsConfig, options: SendEmailJsOptions): Promise<void> {
  const serviceId  = options.serviceId  ?? config.serviceId;
  const templateId = options.templateId ?? config.templateId;

  if (!serviceId || !templateId || !config.publicKey || !config.privateKey) {
    throw new EmailJsError('EmailJS is not configured (missing serviceId/templateId/publicKey/privateKey)');
  }

  let res: Response;
  try {
    res = await fetch(EMAILJS_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  serviceId,
        template_id: templateId,
        user_id:     config.publicKey,
        accessToken: config.privateKey,
        template_params: options.templateParams,
      }),
    });
  } catch (err) {
    throw new EmailJsError(`EmailJS request threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EmailJsError(`EmailJS send failed: ${res.status}`, res.status, body);
  }
}
