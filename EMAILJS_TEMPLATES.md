# EmailJS templates

The EmailJS client (`src/lib/emailjs.ts`) is generic — it just POSTs whatever
`templateParams` a caller gives it to whichever template EmailJS is configured with. This
file documents the actual templates this project sends, so the template content lives
somewhere other than "whatever's currently in the EmailJS dashboard."

To add a new email kind: create a template in the EmailJS dashboard, add a helper next to
`sendMerchantInviteEmail` in `src/services/email.service.ts` that calls `sendEmailJs()` with
that template's `templateParams`, and document it below.

## merchant-invite

Sent by `sendMerchantInviteEmail()` (`src/services/email.service.ts`), triggered from
`merchantApplications.service.ts` when an admin approves an application or resends an invite.

**EmailJS dashboard → Email Templates → Create New Template**

| Setting | Value |
|---|---|
| To Email | `{{to_email}}` |
| From Name | `KokTable` |
| Reply To | (your support address, optional) |
| Subject | `You're invited to set up {{restaurant_name}} on KokTable` |

**Template params sent by the code** (must match placeholders used below exactly):

| Variable | Description |
|---|---|
| `to_email` | Applicant's contact email — also goes in the "To Email" setting above |
| `restaurant_name` | Restaurant name from the merchant application |
| `invite_url` | One-time invite link (`${MERCHANT_FRONTEND_URL}/invite/<token>`), valid for `INVITE_TOKEN_TTL_MS` |

**Content (HTML)** — paste into the template's "Content" tab:

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">You're invited to KokTable</h1>

  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
    Your application for <strong>{{restaurant_name}}</strong> has been approved.
    Click below to set up your merchant account and start managing your restaurant on KokTable.
  </p>

  <p style="margin: 0 0 24px;">
    <a href="{{invite_url}}"
       style="display: inline-block; background: #1a1a1a; color: #ffffff; text-decoration: none;
              padding: 12px 24px; border-radius: 6px; font-size: 15px; font-weight: 600;">
      Set up your account
    </a>
  </p>

  <p style="font-size: 13px; line-height: 1.6; color: #666666; margin: 0 0 8px;">
    This link is single-use and expires in 7 days. If the button above doesn't work, copy and
    paste this URL into your browser:
  </p>
  <p style="font-size: 13px; line-height: 1.6; color: #666666; margin: 0; word-break: break-all;">
    {{invite_url}}
  </p>

  <hr style="border: none; border-top: 1px solid #eeeeee; margin: 32px 0 16px;" />

  <p style="font-size: 12px; color: #999999; margin: 0;">
    Didn't apply for a KokTable merchant account? You can safely ignore this email.
  </p>
</div>
```

**Env vars** (`.env`, see `.env.example`):

```
EMAILJS_SERVICE_ID=
EMAILJS_TEMPLATE_ID=      # the template ID EmailJS assigns the template above
EMAILJS_PUBLIC_KEY=
EMAILJS_PRIVATE_KEY=
```
