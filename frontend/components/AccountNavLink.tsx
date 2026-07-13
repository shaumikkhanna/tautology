"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AccountNavLink() {
	const supabase = useMemo(() => createBrowserSupabaseClient(), []);
	const [isSignedIn, setIsSignedIn] = useState(false);

	useEffect(() => {
		if (!supabase) {
			setIsSignedIn(false);
			return;
		}

		let isMounted = true;

		supabase.auth.getSession().then(({ data }) => {
			if (isMounted) {
				setIsSignedIn(Boolean(data.session));
			}
		});

		const { data: listener } = supabase.auth.onAuthStateChange(
			(_event, session) => {
				setIsSignedIn(Boolean(session));
			},
		);

		return () => {
			isMounted = false;
			listener.subscription.unsubscribe();
		};
	}, [supabase]);

	return (
		<Link
			aria-label={isSignedIn ? "Account" : "Log in"}
			className="grid h-8 w-8 place-items-center rounded-full border border-paper/60 text-paper transition hover:border-brass hover:text-brass"
			href="/login"
			title={isSignedIn ? "Account" : "Log in"}
		>
			{isSignedIn ? (
				<svg
					aria-hidden="true"
					className="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						d="M7 11.5 10.2 15 17.5 7"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2.2"
					/>
					<circle
						cx="12"
						cy="12"
						r="9"
						stroke="currentColor"
						strokeWidth="2"
					/>
				</svg>
			) : (
				<svg
					aria-hidden="true"
					className="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
					/>
					<path
						d="M4.5 20a7.5 7.5 0 0 1 15 0"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
					/>
				</svg>
			)}
		</Link>
	);
}
