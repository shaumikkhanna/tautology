"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSafeNextPath, withInviteCode } from "@/lib/auth/redirects";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginClient() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const supabase = useMemo(() => createBrowserSupabaseClient(), []);
	const nextPath = getSafeNextPath(searchParams.get("next"));
	const inviteCode = searchParams.get("invite");
	const returnPath = withInviteCode(nextPath, inviteCode);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmNewPassword, setConfirmNewPassword] = useState("");
	const [message, setMessage] = useState("Sign up or log in.");
	const [isLoading, setIsLoading] = useState(false);
	const [session, setSession] = useState<Session | null>(null);

	useEffect(() => {
		if (!supabase) {
			setMessage("Supabase is not configured yet.");
			return;
		}

		supabase.auth.getSession().then(({ data }) => {
			setSession(data.session);
			setMessage(data.session ? "Signed in." : "Sign up or log in.");
		});
	}, [supabase]);

	async function logIn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!supabase) {
			setMessage("Supabase is not configured yet.");
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
			setIsLoading(false);
			return;
		}

		setMessage("Signed in. Returning...");
		router.push(returnPath);
	}

	async function signUp() {
		if (!supabase) {
			setMessage("Supabase is not configured yet.");
			return;
		}

		setIsLoading(true);
		setMessage("Creating account...");

		const { error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				emailRedirectTo: `${window.location.origin}${returnPath}`,
			},
		});

		setMessage(
			error
				? error.message
				: "Check your email to confirm your account.",
		);
		setIsLoading(false);
	}

	async function changePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!supabase || !session) {
			setMessage("Log in before changing your password.");
			return;
		}

		if (newPassword.length < 6) {
			setMessage("New password must be at least 6 characters.");
			return;
		}

		if (newPassword !== confirmNewPassword) {
			setMessage("New passwords do not match.");
			return;
		}

		setIsLoading(true);
		setMessage("Changing password...");

		const { error } = await supabase.auth.updateUser({
			password: newPassword,
		});

		if (error) {
			setMessage(error.message);
		} else {
			setNewPassword("");
			setConfirmNewPassword("");
			setMessage("Password changed.");
		}

		setIsLoading(false);
	}

	async function logOut() {
		if (!supabase) {
			return;
		}

		setIsLoading(true);
		setMessage("Logging out...");

		const { error } = await supabase.auth.signOut();

		if (error) {
			setMessage(error.message);
			setIsLoading(false);
			return;
		}

		setSession(null);
		setMessage("Signed out.");
		setIsLoading(false);
	}

	return (
		<div className="flex flex-1 items-center justify-center px-4 py-12">
			<section className="w-full max-w-md border-2 border-[#514531] bg-[#d8cf9f] p-6 shadow-[6px_6px_0_#514531]">
				<p className="font-mono text-xs font-bold uppercase text-[#6d5d42]">
					TOOMUCHMATHS
				</p>
				<h1 className="mt-3 font-mono text-3xl font-bold uppercase tracking-normal text-[#24211d]">
					{session ? "Account" : "Sign up or log in"}
				</h1>
				<p className="mt-3 text-sm leading-6 text-[#514531]">
					{session
						? "Hello. You are signed in and ready to go."
						: "Use one account for StageSelect, the crossword archive, and crossword admin."}
				</p>

				{session ? (
					<div className="mt-5 grid gap-4">
						<p className="break-all text-sm text-[#514531]">
							Signed in as{" "}
							<strong className="text-[#24211d]">
								{session.user.email}
							</strong>
						</p>
						<button
							className="border-2 border-[#24211d] bg-[#24211d] px-4 py-3 font-mono text-xs font-bold uppercase text-[#f2ead0] transition hover:bg-[#514531]"
							onClick={() => router.push(returnPath)}
							type="button"
						>
							Continue
						</button>
						<form
							className="grid gap-3 border-t-2 border-[#b8aa78] pt-4"
							onSubmit={changePassword}
						>
							<p className="font-mono text-xs font-bold uppercase text-[#6d5d42]">
								Change password
							</p>
							<input
								aria-label="New password"
								autoComplete="new-password"
								className="w-full border-2 border-[#514531] bg-[#f2ead0] px-3 py-3 text-sm text-[#24211d] outline-none transition placeholder:text-[#827250] focus:border-[#24211d]"
								disabled={isLoading}
								minLength={6}
								onChange={(event) =>
									setNewPassword(event.target.value)
								}
								placeholder="new password"
								type="password"
								value={newPassword}
							/>
							<input
								aria-label="Confirm new password"
								autoComplete="new-password"
								className="w-full border-2 border-[#514531] bg-[#f2ead0] px-3 py-3 text-sm text-[#24211d] outline-none transition placeholder:text-[#827250] focus:border-[#24211d]"
								disabled={isLoading}
								minLength={6}
								onChange={(event) =>
									setConfirmNewPassword(event.target.value)
								}
								placeholder="confirm new password"
								type="password"
								value={confirmNewPassword}
							/>
							<button
								className="border-2 border-[#514531] bg-[#c9bf8c] px-4 py-3 font-mono text-xs font-bold uppercase text-[#24211d] transition hover:bg-[#bfb37c] disabled:cursor-not-allowed disabled:opacity-60"
								disabled={
									isLoading ||
									!newPassword ||
									!confirmNewPassword
								}
								type="submit"
							>
								{isLoading ? "Working" : "Save password"}
							</button>
						</form>
						<button
							className="border-2 border-[#514531] bg-transparent px-4 py-3 font-mono text-xs font-bold uppercase text-[#24211d] transition hover:bg-[#c9bf8c] disabled:cursor-not-allowed disabled:opacity-60"
							disabled={isLoading}
							onClick={logOut}
							type="button"
						>
							Log out
						</button>
					</div>
				) : (
					<form className="mt-5 grid gap-3" onSubmit={logIn}>
						<input
							aria-label="Email"
							autoComplete="email"
							className="w-full border-2 border-[#514531] bg-[#f2ead0] px-3 py-3 text-sm text-[#24211d] outline-none transition placeholder:text-[#827250] focus:border-[#24211d]"
							onChange={(event) => setEmail(event.target.value)}
							placeholder="email@example.com"
							type="email"
							value={email}
						/>
						<input
							aria-label="Password"
							autoComplete="current-password"
							className="w-full border-2 border-[#514531] bg-[#f2ead0] px-3 py-3 text-sm text-[#24211d] outline-none transition placeholder:text-[#827250] focus:border-[#24211d]"
							minLength={6}
							onChange={(event) =>
								setPassword(event.target.value)
							}
							placeholder="password"
							type="password"
							value={password}
						/>
						<div className="grid grid-cols-2 gap-3">
							<button
								className="border-2 border-[#24211d] bg-[#24211d] px-4 py-3 font-mono text-xs font-bold uppercase text-[#f2ead0] transition hover:bg-[#514531] disabled:cursor-not-allowed disabled:opacity-60"
								disabled={isLoading || !email || !password}
								type="submit"
							>
								{isLoading ? "Working" : "Log in"}
							</button>
							<button
								className="border-2 border-[#514531] bg-[#c9bf8c] px-4 py-3 font-mono text-xs font-bold uppercase text-[#24211d] transition hover:bg-[#bfb37c] disabled:cursor-not-allowed disabled:opacity-60"
								disabled={isLoading || !email || !password}
								onClick={signUp}
								type="button"
							>
								Sign up
							</button>
						</div>
					</form>
				)}

				<p className="mt-4 min-h-5 text-sm text-[#514531]">{message}</p>
			</section>
		</div>
	);
}
