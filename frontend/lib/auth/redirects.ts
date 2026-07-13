export function getSafeNextPath(value: string | null | undefined) {
	if (!value || !value.startsWith("/") || value.startsWith("//")) {
		return "/";
	}

	return value;
}

export function withInviteCode(path: string, inviteCode: string | null | undefined) {
	const trimmedInviteCode = inviteCode?.trim();

	if (!trimmedInviteCode) {
		return path;
	}

	const separator = path.includes("?") ? "&" : "?";

	return `${path}${separator}invite=${encodeURIComponent(trimmedInviteCode)}`;
}

export function getLoginPath(nextPath: string, inviteCode?: string) {
	const params = new URLSearchParams({ next: getSafeNextPath(nextPath) });

	if (inviteCode?.trim()) {
		params.set("invite", inviteCode.trim());
	}

	return `/login?${params.toString()}`;
}
