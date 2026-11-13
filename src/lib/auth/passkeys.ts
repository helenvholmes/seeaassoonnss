import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { BASE_PATH, config } from "../config";
import { sql } from "../db";
import { isOwner, sha256, startSession } from "./session";

const CHALLENGE_COOKIE = "seasons_challenge";
// Every passkey belongs to the one owner, so they share one user handle.
const OWNER_USER_ID = new TextEncoder().encode("seasons-owner");

export class PasskeyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function rp() {
  const url = config.siteUrl;
  return { rpID: url.hostname, origin: url.origin, rpName: "seeaassoonnss" };
}

async function storeChallenge(kind: "register" | "login", challenge: string) {
  const [row] = await sql`
    insert into auth_challenges (kind, challenge, expires_at)
    values (${kind}, ${challenge}, now() + interval '5 minutes') returning id`;
  await sql`delete from auth_challenges where expires_at < now()`;
  (await cookies()).set(CHALLENGE_COOKIE, row.id, {
    httpOnly: true,
    secure: config.siteUrl.protocol === "https:",
    sameSite: "strict",
    path: BASE_PATH,
    maxAge: 300,
  });
}

/** Reads and deletes the pending challenge, so each one is used once. */
async function takeChallenge(kind: "register" | "login"): Promise<string> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete({ name: CHALLENGE_COOKIE, path: BASE_PATH });
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new PasskeyError("The sign-in attempt expired. Try again.");
  const [row] = await sql`delete from auth_challenges where id = ${id} and kind = ${kind} and expires_at > now() returning challenge`;
  if (!row) throw new PasskeyError("The sign-in attempt expired. Try again.");
  return row.challenge;
}

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(sha256(given));
  const b = Buffer.from(sha256(expected));
  return timingSafeEqual(a, b);
}

export async function passkeyCount(): Promise<number> {
  const [row] = await sql`select count(*)::int as n from passkeys`;
  return row.n;
}

/**
 * Who may register a passkey:
 * - the signed-in owner (to add a backup passkey), or
 * - anyone holding the unused SETUP_TOKEN (first passkey on a new deployment, or recovery).
 * Without a session or a valid token, registration is refused, so a stranger
 * cannot claim a fresh fork before its owner.
 */
async function assertMayRegister(setupToken: string | undefined): Promise<{ usesToken: boolean }> {
  if (await isOwner()) return { usesToken: false };
  const expected = config.setupToken;
  if (!expected) throw new PasskeyError("Registration is closed. Set SETUP_TOKEN in the environment to register a passkey.", 403);
  if (!setupToken) throw new PasskeyError("Sign in first, or enter the setup token.", 403);
  if (!tokenMatches(setupToken, expected)) throw new PasskeyError("The setup token is wrong.", 403);
  const [used] = await sql`select 1 from used_setup_tokens where token_hash = ${sha256(expected)}`;
  if (used) throw new PasskeyError("This setup token was already used. Set a new SETUP_TOKEN to register again.", 403);
  return { usesToken: true };
}

export async function registrationOptions(setupToken: string | undefined) {
  await assertMayRegister(setupToken);
  const { rpID, rpName } = rp();
  const existing = await sql`select id, transports from passkeys`;
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: "owner",
    userDisplayName: "seeaassoonnss owner",
    userID: OWNER_USER_ID,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await storeChallenge("register", options.challenge);
  return options;
}

export async function verifyRegistration(response: RegistrationResponseJSON, setupToken: string | undefined) {
  const { usesToken } = await assertMayRegister(setupToken);
  const expectedChallenge = await takeChallenge("register");
  const { rpID, origin } = rp();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    throw new PasskeyError(`Passkey could not be verified: ${(e as Error).message}`);
  }
  if (!verification.verified) throw new PasskeyError("Passkey could not be verified.");
  const info = verification.registrationInfo;
  await sql.begin(async (tx) => {
    await tx`
      insert into passkeys (id, public_key, counter, transports, device_type, backed_up)
      values (${info.credential.id}, ${Buffer.from(info.credential.publicKey)}, ${info.credential.counter},
              ${info.credential.transports ?? null}, ${info.credentialDeviceType}, ${info.credentialBackedUp})`;
    if (usesToken) {
      await tx`insert into used_setup_tokens (token_hash) values (${sha256(config.setupToken!)}) on conflict do nothing`;
    }
  });
  await startSession();
}

export async function authenticationOptions() {
  const { rpID } = rp();
  // No allowCredentials: the browser offers the owner's discoverable passkeys.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await storeChallenge("login", options.challenge);
  return options;
}

export async function verifyAuthentication(response: AuthenticationResponseJSON) {
  const expectedChallenge = await takeChallenge("login");
  const [row] = await sql`select * from passkeys where id = ${response.id}`;
  if (!row) throw new PasskeyError("This passkey is not registered here.", 401);
  const { rpID, origin } = rp();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(row.public_key),
        counter: Number(row.counter),
        transports: row.transports ?? undefined,
      },
    });
  } catch (e) {
    throw new PasskeyError(`Passkey could not be verified: ${(e as Error).message}`, 401);
  }
  if (!verification.verified) throw new PasskeyError("Passkey could not be verified.", 401);
  await sql`update passkeys set counter = ${verification.authenticationInfo.newCounter}, last_used_at = now() where id = ${row.id}`;
  await startSession();
}
