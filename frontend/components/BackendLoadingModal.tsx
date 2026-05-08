"use client";

import { useEffect, useState } from "react";
import styles from "./BackendLoadingModal.module.css";

type BackendLoadingModalProps = {
	errorMessage?: string;
	onCancel: () => void;
	onClose: () => void;
	state: "loading" | "error";
};

const BACKEND_LOADING_MESSAGE =
	"This part of the app needs the backend. This may take upto a minute to wake up. If you find your attention drifting, reflect on the state of the current generation's attention spans and the tech industrial complex's compute costs. If it still bothers you, listen to some calming newage music..";
const BACKEND_LOADING_LINK_HREF = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
const BACKEND_LOADING_LINK_LABEL = "Calming newage music";

export function BackendLoadingModal({
	errorMessage,
	onCancel,
	onClose,
	state,
}: BackendLoadingModalProps) {
	const [pointer, setPointer] = useState({ x: 24, y: 24 });

	useEffect(() => {
		if (state !== "loading") {
			return;
		}

		function updatePointer(event: PointerEvent) {
			setPointer({ x: event.clientX, y: event.clientY });
		}

		document.body.classList.add(styles.waiting);
		window.addEventListener("pointermove", updatePointer);

		return () => {
			document.body.classList.remove(styles.waiting);
			window.removeEventListener("pointermove", updatePointer);
		};
	}, [state]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4">
			{state === "loading" ? (
				<span
					aria-hidden="true"
					className={styles.hourglass}
					style={
						{
							"--hourglass-x": `${pointer.x}px`,
							"--hourglass-y": `${pointer.y}px`,
						} as React.CSSProperties
					}
				/>
			) : null}

			<div className="w-full max-w-md border-2 border-ink bg-paperLight p-5 text-ink shadow-hard">
				<p className="font-mono text-xs uppercase text-rule">backend</p>
				<h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal">
					{state === "loading" ? "Loading" : "Could not start"}
				</h2>
				<p className="mt-4 text-sm leading-6">
					{state === "loading"
						? BACKEND_LOADING_MESSAGE
						: errorMessage}
				</p>

				{state === "loading" ? (
					<a
						className="mt-4 inline-block px-1 font-mono text-xs uppercase text-blue-700 underline decoration-2 underline-offset-4 hover:bg-brass hover:text-ink"
						href={BACKEND_LOADING_LINK_HREF}
						rel="noreferrer"
						target="_blank"
					>
						{BACKEND_LOADING_LINK_LABEL}
					</a>
				) : null}

				<div className="mt-6 flex gap-3">
					{state === "loading" ? (
						<button
							type="button"
							onClick={onCancel}
							className="border-2 border-ink bg-paper px-4 py-2 font-mono text-xs uppercase text-ink hover:bg-brass"
						>
							Cancel
						</button>
					) : (
						<button
							type="button"
							onClick={onClose}
							className="border-2 border-ink bg-soot px-4 py-2 font-mono text-xs uppercase text-paper hover:bg-brass hover:text-ink"
						>
							Close
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
