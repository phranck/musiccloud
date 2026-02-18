import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getAdminRepository } from "../db/index.js";

interface SetupBody {
  username: string;
  password: string;
}

interface LoginBody {
  username: string;
  password: string;
}

async function adminAuthRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/auth/setup-status
   * Returns whether first-run setup is required (no admin users exist yet).
   */
  app.get("/api/admin/auth/setup-status", async (_request, reply) => {
    const repo = await getAdminRepository();
    const count = await repo.countAdmins();
    return reply.send({ setupRequired: count === 0 });
  });

  /**
   * POST /api/admin/auth/setup
   * Creates the first admin user. Returns 409 if any admin already exists.
   */
  app.post("/api/admin/auth/setup", async (request, reply) => {
    const body = request.body as SetupBody | null;

    if (!body?.username || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "username and password are required." });
    }

    const username = body.username.trim();
    const password = body.password;

    if (username.length < 3 || username.length > 32) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "username must be between 3 and 32 characters." });
    }
    if (password.length < 8 || password.length > 128) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "password must be between 8 and 128 characters." });
    }

    const repo = await getAdminRepository();
    const count = await repo.countAdmins();

    if (count > 0) {
      return reply.status(409).send({ error: "CONFLICT", message: "Setup already completed. An admin user already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await repo.createAdminUser({ id: nanoid(), username, passwordHash });

    app.log.info("[Admin] First admin user created");
    return reply.status(201).send({ message: "Admin user created." });
  });

  /**
   * POST /api/admin/auth/login
   * Authenticates an admin user and returns a signed JWT.
   */
  app.post("/api/admin/auth/login", async (request, reply) => {
    const body = request.body as LoginBody | null;

    if (!body?.username || !body?.password) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "username and password are required." });
    }

    const repo = await getAdminRepository();
    const user = await repo.findAdminByUsername(body.username.trim());

    // Constant-time comparison: always hash-compare to prevent timing attacks
    const dummyHash = "$2a$12$invalidhashfortimingprotection000000000000000000000000";
    const isValid = user
      ? await bcrypt.compare(body.password, user.passwordHash)
      : await bcrypt.compare(body.password, dummyHash);

    if (!user || !isValid) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "Invalid username or password." });
    }

    const token = app.jwt.sign(
      { sub: user.id, username: user.username, role: "admin" },
      { expiresIn: "24h" },
    );

    // Update last login timestamp (fire and forget)
    repo.updateLastLogin(user.id).catch(() => undefined);

    return reply.send({ token, username: user.username, expiresIn: 86400 });
  });
}

export default fp(adminAuthRoutes, { name: "admin-auth" });
