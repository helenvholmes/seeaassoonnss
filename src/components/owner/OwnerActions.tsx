"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { api } from "@/lib/client";

export function NewSeason() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const { id } = await api<{ id: string }>("/seasons", { body: { title } });
          router.push(`/edit/${id}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <input type="text" placeholder="title, for example: leafy greens" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, width: "auto" }} />
      <button className="primary" disabled={busy}>
        New season
      </button>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}

export function OwnerActions() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="stack">
      <div className="row">
        <button
          onClick={async () => {
            setMessage(null);
            try {
              const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/auth/register/options", { body: {} });
              const response = await startRegistration({ optionsJSON });
              await api("/auth/register/verify", { body: { response } });
              setMessage("Backup passkey added.");
            } catch (err) {
              setMessage((err as Error).message);
            }
          }}
        >
          Add a backup passkey
        </button>
        <button
          className="quiet"
          onClick={async () => {
            await api("/auth/logout", { body: {} });
            router.push("/edit/sign-in");
          }}
        >
          Sign out
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
