import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Sends transactional email directly through Gmail's own SMTP servers,
 * using an App Password (GMAIL_USER + GMAIL_APP_PASSWORD), instead of
 * through a third-party ESP like Brevo.
 *
 * Why this fixes the delivery problem for good, with no domain purchase:
 *
 * Gmail enforces a strict DMARC policy for @gmail.com — any email
 * claiming "From: someone@gmail.com" that wasn't actually sent through
 * Google's own servers gets silently rejected by receiving mail
 * providers (including Gmail itself). That's exactly what was
 * happening via Brevo: Brevo's API accepted the request and returned a
 * real messageId, but delivery was rejected downstream because Brevo
 * isn't Google.
 *
 * Sending through smtp.gmail.com directly sidesteps this entirely —
 * the email genuinely is sent by Google's infrastructure, so DMARC
 * passes normally, exactly like any regular email you send from Gmail
 * in a browser.
 *
 * Limits to know about: a personal Gmail account can send roughly
 * 500 emails/day through SMTP (a Google Workspace account gets more).
 * Fine for testing and an early launch; worth moving to a properly
 * authenticated domain + ESP (Brevo, SES, etc.) once volume grows.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
      this.logger.error(
        `Missing Gmail SMTP config — GMAIL_USER: ${!!user}, GMAIL_APP_PASSWORD: ${!!pass}`,
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const user = process.env.GMAIL_USER;
    const frontendUrl = process.env.FRONTEND_URL_FOR_EMAILS;

    if (!this.transporter || !user || !frontendUrl) {
      throw new Error(
        'Missing required email config (GMAIL_USER, GMAIL_APP_PASSWORD, or FRONTEND_URL_FOR_EMAILS)',
      );
    }

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
      const info = await this.transporter.sendMail({
        from: `"Amana" <${user}>`,
        to,
        subject: 'Verify your Amana account',
        html: htmlContent,
        text: `Welcome to Amana. Verify your email: ${verifyUrl}`,
      });

      this.logger.log(`Verification email sent to ${to} (messageId: ${info.messageId})`);
    } catch (err) {
      this.logger.error(
        `Failed to send verification email to ${to}`,
        err instanceof Error ? err.stack : err,
      );
      throw new InternalServerErrorException('Failed to send verification email');
    }
  }
}