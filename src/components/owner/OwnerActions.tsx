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

/** Creates the demo season with placeholder items, 3D and generative effects (see lib/demo.ts). */
export function DemoSeason() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async (replace: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { id, created } = await api<{ id: string; created: boolean }>("/demo", { body: { replace } });
      if (created) return router.push(`/edit/${id}`);
      setExisting(id);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button disabled={busy} onClick={() => create(false)}>
          {busy ? "Creating the demo season…" : "Create demo season"}
        </button>
        <span className="small muted">A draft at /demo with placeholder photos, a 3D pear, a type effect and a p5.js background, to try things on. Delete it from its settings.</span>
      </div>
      {existing ? (
        <p className="small">
          A demo season already exists. <a href={`/seasons/edit/${existing}`}>Open it</a> or{" "}
          <button
            className="quiet"
            disabled={busy}
            onClick={() => {
              if (confirm("Replace the demo season with a fresh one? Your changes to it are lost.")) void create(true);
            }}
          >
            replace it
          </button>
          .
        </p>
      ) : null}
      {error ? <p className="small error">{error}</p> : null}
    </div>
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
