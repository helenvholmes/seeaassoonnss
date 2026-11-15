"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import { api } from "@/lib/client";

/** Matches the server's WebAuthn timeout. Browsers enforce it themselves; some password manager extensions don't. */
const PROMPT_TIMEOUT_MS = 60_000;

class PromptTimeout extends Error {}

/** Gives up on a passkey prompt that never answers, so the page doesn't wait forever. */
function withTimeout<T>(prompt: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      WebAuthnAbortService.cancelCeremony();
      reject(new PromptTimeout("Your passkey didn't respond. Try again, or try another browser or passkey. A password manager's browser extension can get stuck here."));
    }, PROMPT_TIMEOUT_MS);
  });
  return Promise.race([prompt, timeout]).finally(() => clearTimeout(timer));
}

export function SignIn({ hasPasskeys }: { hasPasskeys: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [showRegister, setShowRegister] = useState(!hasPasskeys);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  async function prompt<T>(start: () => Promise<T>): Promise<T> {
    setWaiting(true);
    try {
      return await withTimeout(start());
    } finally {
      setWaiting(false);
    }
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.push("/edit");
      router.refresh();
    } catch (err) {
      const e = err as Error;
      // A cancelled ceremony rejects with AbortError after the timeout already explained itself.
      if (!(e instanceof PromptTimeout) && e.name === "AbortError") return setBusy(false);
      setError(e.name === "NotAllowedError" ? "The passkey prompt was closed." : e.message);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {hasPasskeys ? (
        <div>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const optionsJSON = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/auth/login/options", { body: {} });
                const response = await prompt(() => startAuthentication({ optionsJSON }));
                await api("/auth/login/verify", { body: { response } });
              })
            }
          >
            Sign in with a passkey
          </button>
        </div>
      ) : (
        <p>No passkey is registered yet. Enter the SETUP_TOKEN from this deployment's environment to register the first one.</p>
      )}

      {showRegister ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/auth/register/options", { body: { setupToken: token } });
              const response = await prompt(() => startRegistration({ optionsJSON }));
              await api("/auth/register/verify", { body: { response, setupToken: token } });
            });
          }}
        >
          <label className="stack" style={{ gap: 4 }}>
            Setup token
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
          </label>
          <div>
            <button disabled={busy || !token}>Register a passkey</button>
          </div>
          {hasPasskeys ? <p className="muted">Each setup token works once. To recover access, set a new SETUP_TOKEN and use it here.</p> : null}
        </form>
      ) : (
        <button className="quiet" style={{ alignSelf: "flex-start" }} onClick={() => setShowRegister(true)}>
          Lost your passkeys?
        </button>
      )}
      {waiting ? <p className="muted" role="status">Waiting for your passkey…</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
