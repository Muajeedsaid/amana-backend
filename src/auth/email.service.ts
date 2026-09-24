import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    const frontendUrl = process.env.FRONTEND_URL_FOR_EMAILS;
    const fromEmail = process.env.BREVO_FROM_EMAIL;

    if (!apiKey || !frontendUrl || !fromEmail) {
      this.logger.error(
        `Missing email config — apiKey: ${!!apiKey}, frontendUrl: ${!!frontendUrl}, fromEmail: ${!!fromEmail}`
      );
      throw new Error('Missing required email config (BREVO_API_KEY, FRONTEND_URL_FOR_EMAILS, or BREVO_FROM_EMAIL)');
    }

    // TEMPORARY DIAGNOSTIC LOG — remove once the real issue is found.
    // Logs the shape of the key without exposing the full secret, so we
    // can rule out a corrupted/truncated env var (extra whitespace, a
    // stray quote character copied in from .env, wrong length, etc.)
    // without ever printing the actual key into Render's logs.
    this.logger.log(
      `[DIAGNOSTIC] API key length: ${apiKey.length}, starts with: "${apiKey.slice(0, 12)}", ends with: "${apiKey.slice(-6)}", has whitespace: ${/\s/.test(apiKey)}`
    );
    this.logger.log(`[DIAGNOSTIC] fromEmail: "${fromEmail}", frontendUrl: "${frontendUrl}"`);

    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F4C45;">Welcome to Amana</h2>
        <p>Click the button below to verify your email address and activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block; background:#C85A3F; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; margin-top:16px;">
          Verify my email
        </a>
        <p style="margin-top: 24px; color: #666; font-size: 13px;">
          If the button doesn't work, copy this link into your browser:<br/>
          ${verifyUrl}
        </p>
      </div>
    `;

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: 'Amana' },
          to: [{ email: to }],
          subject: 'Verify your Amana account',
          htmlContent,
          textContent: `Welcome to Amana. Verify your email: ${verifyUrl}`,
        }),
      });

      // TEMPORARY DIAGNOSTIC LOG — this is the key one. Brevo's real
      // success response always includes a "messageId" field. If this
      // logs something that ISN'T a real Brevo messageId, or the status
      // code looks wrong, that tells us the request isn't landing where
      // we think it is.
      const responseText = await response.text();
      this.logger.log(
        `[DIAGNOSTIC] Brevo responded — status: ${response.status}, ok: ${response.ok}, body: ${responseText}`
      );

      if (!response.ok) {
        throw new Error(`Brevo API responded with ${response.status}: ${responseText}`);
      }

      this.logger.log(`Verification email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}`, err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException('Failed to send verification email');
    }
  }
}