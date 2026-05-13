"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import styles from "./crosswordAdmin.module.css";

type AdminUser = {
  id: string;
  email: string | null;
  createdAt: string;
  approved: boolean;
};

type AdminInvite = {
  code: string;
  email: string | null;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

type AdminPayload = {
  users: AdminUser[];
  invites: AdminInvite[];
};

export default function CrosswordAdminPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [approveEmail, setApproveEmail] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [message, setMessage] = useState("Checking admin session...");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadAdmin(data.session);
      } else {
        setMessage("Log in with a crossword admin email.");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) {
          loadAdmin(nextSession);
        } else {
          setPayload(null);
          setMessage("Log in with a crossword admin email.");
        }
      },
    );

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function logIn() {
    if (!supabase) {
      return;
    }

    setIsLoading(true);
    setMessage("Logging in...");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setEmail("");
      setPassword("");
    }
    setIsLoading(false);
  }

  async function logOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
  }

  async function loadAdmin(nextSession = session) {
    if (!nextSession) {
      return;
    }

    setIsLoading(true);
    const response = await fetchWithSession(nextSession, "/api/admin/crosswords");

    if (!response.ok) {
      const error = await readError(response);
      setPayload(null);
      setMessage(error);
      setIsLoading(false);
      return;
    }

    setPayload((await response.json()) as AdminPayload);
    setMessage("Admin ready.");
    setIsLoading(false);
  }

  async function approveUser() {
    if (!session || !approveEmail) {
      return;
    }

    setIsLoading(true);
    const response = await fetchWithSession(
      session,
      "/api/admin/crosswords/approvals",
      {
        method: "POST",
        body: JSON.stringify({ email: approveEmail }),
      },
    );

    setMessage(response.ok ? "User approved." : await readError(response));
    setApproveEmail("");
    await loadAdmin(session);
    setIsLoading(false);
  }

  async function createInvite() {
    if (!session) {
      return;
    }

    setIsLoading(true);
    const response = await fetchWithSession(
      session,
      "/api/admin/crosswords/invites",
      {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail || undefined,
          expiresInDays: 30,
        }),
      },
    );

    if (!response.ok) {
      setMessage(await readError(response));
      setIsLoading(false);
      return;
    }

    const data = (await response.json()) as { inviteUrl: string };
    setInviteUrl(data.inviteUrl);
    setInviteEmail("");
    setMessage("Invite created.");
    await loadAdmin(session);
    setIsLoading(false);
  }

  const pendingUsers = (payload?.users ?? []).filter((user) => !user.approved);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>/admin/crosswords</p>
            <h1 className={styles.title}>Crossword Admin</h1>
          </div>
          {session ? (
            <button className={styles.secondaryButton} onClick={logOut} type="button">
              Log out
            </button>
          ) : null}
        </header>

        {!session ? (
          <section className={styles.panel}>
            <p className={styles.label}>Admin login</p>
            <div className={styles.form}>
              <input
                className={styles.input}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@example.com"
                type="email"
                value={email}
              />
              <input
                className={styles.input}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="password"
                type="password"
                value={password}
              />
              <button
                className={styles.button}
                disabled={isLoading || !email || !password}
                onClick={logIn}
                type="button"
              >
                Log in
              </button>
            </div>
            <p className={styles.message}>{message}</p>
          </section>
        ) : (
          <div className={styles.stack}>
            <section className={styles.card}>
              <p className={styles.label}>Create invite</p>
              <div className={styles.form}>
                <input
                  className={styles.input}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="optional@email.com"
                  type="email"
                  value={inviteEmail}
                />
                <button
                  className={styles.button}
                  disabled={isLoading}
                  onClick={createInvite}
                  type="button"
                >
                  Create invite link
                </button>
              </div>
              {inviteUrl ? (
                <p className={styles.inviteUrl}>{inviteUrl}</p>
              ) : null}
            </section>

            <section className={styles.card}>
              <p className={styles.label}>Approve by email</p>
              <div className={styles.form}>
                <input
                  className={styles.input}
                  onChange={(event) => setApproveEmail(event.target.value)}
                  placeholder="signedup@email.com"
                  type="email"
                  value={approveEmail}
                />
                <button
                  className={styles.button}
                  disabled={isLoading || !approveEmail}
                  onClick={approveUser}
                  type="button"
                >
                  Approve user
                </button>
              </div>
            </section>

            <section className={styles.card}>
              <p className={styles.label}>Pending signed-up users</p>
              <div className={styles.list}>
                {pendingUsers.length === 0 ? (
                  <p className={styles.muted}>No pending users.</p>
                ) : (
                  pendingUsers.map((user) => (
                    <div className={styles.row} key={user.id}>
                      <div className={styles.rowTop}>
                        <strong>{user.email ?? "No email"}</strong>
                        <button
                          className={styles.secondaryButton}
                          disabled={isLoading || !user.email}
                          onClick={() => {
                            setApproveEmail(user.email ?? "");
                          }}
                          type="button"
                        >
                          Copy email
                        </button>
                      </div>
                      <span className={styles.muted}>
                        Joined {formatDate(user.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className={styles.card}>
              <p className={styles.label}>Invites</p>
              <div className={styles.list}>
                {(payload?.invites ?? []).map((invite) => (
                  <div className={styles.row} key={invite.code}>
                    <div className={styles.rowTop}>
                      <strong>{invite.code}</strong>
                      <span className={styles.muted}>
                        {invite.used_at ? "Used" : "Open"}
                      </span>
                    </div>
                    <span className={styles.muted}>{invite.email ?? "Any email"}</span>
                    <span className={styles.muted}>
                      Created {formatDate(invite.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
        {session ? <p className={styles.message}>{message}</p> : null}
      </div>
    </main>
  );
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? "Request failed.";
}

function fetchWithSession(
  session: Session,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  return fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
