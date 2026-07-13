import { Suspense } from "react";
import { LoginClient } from "./LoginClient";

export default function LoginPage() {
	return (
		<Suspense
			fallback={
				<div className="flex flex-1 items-center justify-center px-4 py-12">
					<p className="font-mono text-sm uppercase text-[#514531]">
						Checking account...
					</p>
				</div>
			}
		>
			<LoginClient />
		</Suspense>
	);
}
