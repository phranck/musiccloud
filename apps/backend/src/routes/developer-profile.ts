/**
 * @file The developer portal routes that change a signed-in account: the
 * profile fields, the sign-in address and the picture.
 *
 * Registered by `devAuthRoutes` in `developer-auth.ts`, so they keep the paths,
 * scope and guards they had there. Every route but the address confirmation
 * attaches the {@link FastifyInstance.authenticateDeveloper} guard inline as a
 * `preValidation` hook. The address change, its confirmation and the Gravatar
 * lookup share the credential throttle of `developer-credential-throttle.ts`
 * with sign-in.
 */
import {
  EmailAction,
  EmailRecipientKind,
  ENDPOINTS,
  IMAGE_UPLOAD_MAX_BYTES,
  MAX_DISPLAY_NAME_LENGTH,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getDeveloperRepository } from "../db/index.js";
import {
  EMAIL_TAKEN_CODE,
  INVALID_EMAIL_CODE,
  isValidEmailAddress,
  normalizeEmailAddress,
} from "../lib/email-address.js";
import { requireEnv } from "../lib/env.js";
import { findGravatar, isGravatarAddress } from "../lib/gravatar.js";
import { IMAGE_UPLOAD_BODY_LIMIT_BYTES, ImageUploadRefusal, parseImageDataUrl } from "../lib/image-upload.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import {
  generateEmailToken,
  hashEmailToken,
  sha256Hex,
  TokenPurpose,
  verifyPassword,
} from "../services/developer-auth.js";
import { triggerEmailAction } from "../services/email-actions.js";
import { AvatarSource, buildAccountResponse, isAvatarSource } from "./developer-account-response.js";
import { throttleCredentials } from "./developer-credential-throttle.js";

/**
 * How long a confirmation link for a new sign-in address lives.
 *
 * A day, like the verification link it resembles: both ask somebody to prove
 * they can read a mailbox, and both are followed from wherever that mailbox is
 * rather than straight away.
 */
const CHANGE_EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Registers the profile, sign-in address and picture routes under
 * `/api/dev/auth/*`.
 *
 * @param app - the Fastify instance this route group is registered on. Must
 *   have `@fastify/jwt`, `@fastify/cookie` and the auth plugin
 *   ({@link FastifyInstance.authenticateDeveloper}) registered beforehand.
 */
export async function devProfileRoutes(app: FastifyInstance) {
  /**
   * PATCH /api/dev/auth/profile
   * Sets or clears the caller's display name and technical contact address.
   *
   * Each field is optional and only what the body carries is written, so the
   * two screens that edit them do not overwrite each other. Sending `null`
   * clears a field.
   *
   * The contact address is where the operator writes when an application on
   * this account needs a person who can act. It is not verified, and nothing
   * that only the account holder may read is sent to it. The portal says so
   * where the field is entered, so a developer is not led to believe it can
   * receive a password reset.
   */
  app.patch(ENDPOINTS.dev.auth.profile, { preValidation: app.authenticateDeveloper }, async (request, reply) => {
    const body = request.body as {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      avatarSource?: string | null;
      gravatarUrl?: string | null;
      technicalContactEmail?: string | null;
    } | null;
    const named =
      body &&
      (body.displayName !== undefined ||
        body.firstName !== undefined ||
        body.lastName !== undefined ||
        body.avatarSource !== undefined ||
        body.gravatarUrl !== undefined ||
        body.technicalContactEmail !== undefined);
    if (!named) {
      return reply.status(400).send({
        error: "INVALID_REQUEST",
        message: "displayName, firstName, lastName, avatarSource or technicalContactEmail is required.",
      });
    }

    const changes: {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      avatarSource?: string | null;
      gravatarUrl?: string | null;
      technicalContactEmail?: string | null;
    } = {};

    // The two names follow the display name in every respect, including that an
    // empty field and an absent one are the same state.
    for (const field of ["firstName", "lastName"] as const) {
      const value = body[field];
      if (value === undefined) continue;
      if (value === null) {
        changes[field] = null;
        continue;
      }
      if (typeof value !== "string") {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: `${field} must be a string.` });
      }
      const trimmed = value.trim();
      if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
        return reply.status(400).send({
          error: "INVALID_REQUEST",
          message: `${field} may be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
        });
      }
      changes[field] = trimmed === "" ? null : trimmed;
    }

    if (body.gravatarUrl !== undefined) {
      if (body.gravatarUrl === null) {
        changes.gravatarUrl = null;
      } else {
        // The address was handed to the browser by Gravatar and comes back from
        // it, so it is checked again here rather than trusted on the way in.
        if (!isGravatarAddress(body.gravatarUrl)) {
          return reply
            .status(400)
            .send({ error: "INVALID_REQUEST", message: "gravatarUrl must be a Gravatar address." });
        }
        changes.gravatarUrl = body.gravatarUrl;
      }
    }

    if (body.avatarSource !== undefined) {
      if (body.avatarSource !== null && !isAvatarSource(body.avatarSource)) {
        return reply.status(400).send({
          error: "INVALID_REQUEST",
          message: `avatarSource must be one of ${Object.values(AvatarSource).join(", ")}.`,
        });
      }
      changes.avatarSource = body.avatarSource;
    }

    if (body.displayName !== undefined) {
      if (body.displayName === null) {
        changes.displayName = null;
      } else {
        if (typeof body.displayName !== "string") {
          return reply.status(400).send({ error: "INVALID_REQUEST", message: "displayName must be a string." });
        }
        const trimmed = body.displayName.trim();
        if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
          return reply.status(400).send({
            error: "INVALID_REQUEST",
            message: `displayName may be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
          });
        }
        // An empty field means "no display name", which is the same state as an
        // absent one, so both store null rather than an empty string.
        changes.displayName = trimmed === "" ? null : trimmed;
      }
    }

    if (body.technicalContactEmail !== undefined) {
      let technicalContactEmail: string | null = null;
      if (body.technicalContactEmail !== null) {
        if (typeof body.technicalContactEmail !== "string") {
          return reply
            .status(400)
            .send({ error: "INVALID_REQUEST", message: "technicalContactEmail must be a string." });
        }
        const trimmed = body.technicalContactEmail.trim();
        // An empty field means "no technical contact", which is the same state
        // as an absent one, so both store null rather than an empty string.
        if (trimmed !== "") {
          if (!isValidEmailAddress(trimmed)) {
            return reply.status(400).send({ error: "INVALID_REQUEST", message: "technicalContactEmail is not valid." });
          }
          technicalContactEmail = trimmed;
        }
      }
      changes.technicalContactEmail = technicalContactEmail;
    }

    const repo = await getDeveloperRepository();
    const updated = await repo.updateDeveloperAccount(request.developerAccountId as string, changes);
    if (!updated) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    }
    return reply.send({ account: buildAccountResponse(updated, null) });
  });

  /**
   * POST /api/dev/auth/change-email
   * Asks to sign in with a different address.
   *
   * Nothing moves here. The account keeps its address until the link sent to
   * the new one is followed, so a typo costs a second attempt rather than the
   * account. The password is required because a session left open on a
   * borrowed machine must not be enough to take an account over by moving its
   * address.
   *
   * The new address hears that it has to confirm; the old one hears that a
   * change was asked for, which is how a change nobody asked for gets noticed.
   */
  app.post(
    ENDPOINTS.dev.auth.changeEmail,
    { preValidation: app.authenticateDeveloper, preHandler: throttleCredentials },
    async (request, reply) => {
      const account = request.developerAccount!;
      const body = request.body as { email?: string; password?: string } | null;

      if (!body?.email) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "email is required." });
      }

      // A GitHub-only account has no password to confirm with, so it cannot take
      // this path. Offering it without the confirmation would be the weaker door
      // on the same house.
      if (account.passwordHash === null) {
        return reply.status(403).send({
          error: "PASSWORD_REQUIRED",
          message: "This account signs in through GitHub, so its address is the one GitHub holds.",
        });
      }
      if (!body.password || !(await verifyPassword(body.password, account.passwordHash))) {
        return reply.status(403).send({ error: "INVALID_CREDENTIALS", message: "That password is not right." });
      }

      const email = normalizeEmailAddress(body.email);
      if (!email) {
        return reply.status(400).send(createApiErrorResponse(INVALID_EMAIL_CODE));
      }
      if (email === account.email) {
        return reply
          .status(400)
          .send({ error: "INVALID_REQUEST", message: "That is already the address you sign in with." });
      }

      const repo = await getDeveloperRepository();
      if (await repo.findDeveloperAccountByEmail(email)) {
        return reply.status(409).send(createApiErrorResponse(EMAIL_TAKEN_CODE));
      }

      const { raw, hash } = generateEmailToken();
      await repo.createDeveloperEmailToken({
        accountId: account.id,
        purpose: TokenPurpose.ChangeEmail,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + CHANGE_EMAIL_TOKEN_TTL_MS),
      });
      const updated = await repo.updateDeveloperAccount(account.id, {
        pendingEmail: email,
        pendingEmailRequestedAt: new Date(),
      });
      if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });

      // A pending address nobody was told about is worse than no change at all:
      // the page would report a link that never left the building. Where the
      // confirmation cannot be sent, the request is taken back.
      try {
        await triggerEmailAction(EmailAction.DeveloperEmailChangeRequested, {
          to: { email },
          recipient: { kind: EmailRecipientKind.DeveloperAccount, email, displayName: account.displayName },
          context: { confirmUrl: `${requireEnv("DEVELOPER_URL")}/confirm-email?token=${raw}`, newEmail: email },
        });
      } catch (error) {
        request.log.error({ err: error }, "failed to send the address-change confirmation");
        await repo.updateDeveloperAccount(account.id, { pendingEmail: null, pendingEmailRequestedAt: null });
        return reply.status(503).send({
          error: "EMAIL_UNAVAILABLE",
          message: "The confirmation could not be sent, so nothing was changed. Please try again.",
        });
      }

      // The old address is told, never asked. A failure to reach it must not
      // stop a change the account holder did ask for.
      try {
        await triggerEmailAction(EmailAction.DeveloperEmailChangeNotified, {
          to: { email: account.email },
          recipient: {
            kind: EmailRecipientKind.DeveloperAccount,
            email: account.email,
            displayName: account.displayName,
          },
          context: { newEmail: email },
        });
      } catch (error) {
        request.log.error({ err: error }, "failed to notify the previous address of a change");
      }

      return reply.send({ account: buildAccountResponse(updated, null) });
    },
  );

  /**
   * DELETE /api/dev/auth/change-email
   * Drops a change that has not been confirmed.
   *
   * The token is left to expire rather than hunted down: following it after
   * this finds no pending address and changes nothing.
   */
  app.delete(ENDPOINTS.dev.auth.changeEmail, { preValidation: app.authenticateDeveloper }, async (request, reply) => {
    const repo = await getDeveloperRepository();
    const updated = await repo.updateDeveloperAccount(request.developerAccountId as string, {
      pendingEmail: null,
      pendingEmailRequestedAt: null,
    });
    if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    return reply.send({ account: buildAccountResponse(updated, null) });
  });

  /**
   * POST /api/dev/auth/confirm-email-change
   * Redeems the confirmation token and moves the address.
   *
   * No session is required: the token is the proof, which is what lets somebody
   * confirm from the device their new mailbox is on.
   */
  app.post(ENDPOINTS.dev.auth.confirmEmailChange, { preHandler: throttleCredentials }, async (request, reply) => {
    const body = request.body as { token?: string } | null;
    if (!body?.token) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "token is required." });
    }

    const repo = await getDeveloperRepository();
    const record = await repo.findActiveDeveloperEmailToken(hashEmailToken(body.token), TokenPurpose.ChangeEmail);
    if (!record) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });
    }

    const account = await repo.findDeveloperAccountById(record.accountId);
    if (!account?.pendingEmail) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });
    }

    // Claim first, act second, so two requests carrying the same link cannot
    // both pass and move the address twice.
    if (!(await repo.consumeDeveloperEmailToken(record.id))) {
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });
    }

    // The address may have been taken between the request and the
    // confirmation, and the unique index is what actually decides.
    if (await repo.findDeveloperAccountByEmail(account.pendingEmail)) {
      return reply.status(409).send(createApiErrorResponse(EMAIL_TAKEN_CODE));
    }

    const updated = await repo.updateDeveloperAccount(account.id, {
      email: account.pendingEmail,
      pendingEmail: null,
      pendingEmailRequestedAt: null,
    });
    if (!updated)
      return reply.status(400).send({ error: "INVALID_TOKEN", message: "That link is invalid or has expired." });

    return reply.send({ ok: true });
  });

  /**
   * POST /api/dev/auth/avatar
   * Stores a picture the caller uploaded, as a `data:` URL, and shows it.
   *
   * The image rule is the one every upload route applies, `parseImageDataUrl`,
   * so SVG is refused here as it is on the admin routes.
   */
  app.post(
    ENDPOINTS.dev.auth.avatar,
    { preValidation: app.authenticateDeveloper, bodyLimit: IMAGE_UPLOAD_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const body = request.body as { dataUrl?: string } | null;
      if (!body?.dataUrl) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "dataUrl is required." });
      }
      const image = parseImageDataUrl(body.dataUrl);
      if (!image.ok) {
        const message =
          image.reason === ImageUploadRefusal.TooLarge
            ? `Picture may be at most ${IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024} MB.`
            : "Only JPEG, PNG or WebP.";
        return reply.status(400).send({ error: "INVALID_REQUEST", message });
      }

      const repo = await getDeveloperRepository();
      // Uploading is choosing: nobody uploads a picture to keep looking like
      // whatever they looked like before.
      const updated = await repo.updateDeveloperAccount(request.developerAccountId as string, {
        uploadedAvatarUrl: body.dataUrl,
        avatarSource: AvatarSource.Upload,
      });
      if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
      return reply.send({ account: buildAccountResponse(updated, null) });
    },
  );

  /**
   * DELETE /api/dev/auth/avatar
   * Removes the uploaded picture and leaves the other two sources alone.
   *
   * The source falls back to whatever is left rather than to nothing, so
   * removing an upload where a Gravatar exists shows the Gravatar.
   */
  app.delete(ENDPOINTS.dev.auth.avatar, { preValidation: app.authenticateDeveloper }, async (request, reply) => {
    const account = request.developerAccount!;
    const repo = await getDeveloperRepository();
    const updated = await repo.updateDeveloperAccount(account.id, {
      uploadedAvatarUrl: null,
      avatarSource: account.avatarSource === AvatarSource.Upload ? null : account.avatarSource,
    });
    if (!updated) return reply.status(401).send({ error: "UNAUTHORIZED", message: "Account not found." });
    return reply.send({ account: buildAccountResponse(updated, null) });
  });

  /**
   * POST /api/dev/auth/avatar/gravatar
   * Asks Gravatar whether the caller's address has a picture.
   *
   * On the server, and only when the caller asks. The request tells Automattic
   * that an account exists here for that address, which is not something to do
   * quietly whilst a page renders. `d=404` is what makes the answer a yes or a
   * no rather than a placeholder image dressed as a picture.
   */
  app.post(
    ENDPOINTS.dev.auth.gravatar,
    { preValidation: app.authenticateDeveloper, preHandler: throttleCredentials },
    async (request, reply) => {
      const account = request.developerAccount!;
      // Gravatar keys a picture by the hash of the trimmed, lowercased address,
      // which is the form the address is stored in.
      const email = normalizeEmailAddress(account.email);
      if (!email) return reply.send({ found: false, gravatarUrl: null });
      const hash = sha256Hex(email);

      let url: string | null;
      try {
        url = await findGravatar(hash);
      } catch {
        return reply.status(502).send({ error: "GRAVATAR_UNAVAILABLE", message: "Gravatar could not be asked." });
      }
      const found = url !== null;

      // Nothing is written here. A lookup is a question, and what the developer
      // does with the answer is decided when they save.
      return reply.send({ found, gravatarUrl: url });
    },
  );
}
