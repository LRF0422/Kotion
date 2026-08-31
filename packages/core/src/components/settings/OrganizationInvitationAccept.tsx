import {
    APIS,
    clearContextSensitiveClientState,
    getAccessToken,
    getRefreshToken,
    normalizeTokenResponse,
    notifyContextChanged,
    saveTokens,
    useApi,
    useNavigate,
    useParams,
    useTranslation,
} from "@kn/common";
import { Check, Loader2 } from "@kn/icon";
import { Button } from "@kn/ui";
import React, { useCallback, useEffect, useRef, useState } from "react";

export const OrganizationInvitationAccept: React.FC = () => {
    const { token = "" } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const started = useRef(false);
    const [status, setStatus] = useState<"loading" | "accepted" | "error">("loading");
    const [error, setError] = useState("");

    const completeInvitation = useCallback(async () => {
        if (!token) {
            setStatus("error");
            setError(t("settings.members.invitationInvalid"));
            return;
        }
        if (!getAccessToken()) {
            navigate(`/login?redirect=${encodeURIComponent(`/organization-invite/${token}`)}`, { replace: true });
            return;
        }

        const acceptedContextKey = `kn:accepted-invitation:${token}`;
        setStatus("loading");
        setError("");
        try {
            let contextId = sessionStorage.getItem(acceptedContextKey) || "";
            if (!contextId) {
                const accepted = await useApi(APIS.ACCEPT_ORGANIZATION_INVITATION, { token });
                contextId = accepted.data.id;
                // If context switching fails, retry the switch without trying to
                // consume the one-time invitation token again.
                sessionStorage.setItem(acceptedContextKey, contextId);
            }
            setStatus("accepted");
            const switched = await useApi(APIS.SWITCH_CONTEXT, { contextId }, {
                refreshToken: getRefreshToken() || "",
            });
            const tokens = normalizeTokenResponse(switched.data);
            if (!tokens.accessToken || !tokens.refreshToken) throw new Error("Missing context tokens");
            saveTokens(tokens.accessToken, tokens.refreshToken);
            sessionStorage.removeItem(acceptedContextKey);
            clearContextSensitiveClientState();
            notifyContextChanged(contextId);
            window.location.assign("/");
        } catch (caught: any) {
            setStatus("error");
            setError(caught?.response?.data?.msg || caught?.message || t("settings.members.invitationFailed"));
        }
    }, [navigate, t, token]);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void completeInvitation();
    }, [completeInvitation]);

    return (
        <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 pt-safe pb-safe">
            <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
                {status === "loading" && <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />}
                {status === "accepted" && <Check className="mx-auto h-8 w-8 text-green-600" />}
                <h1 className="mt-4 text-lg font-semibold">
                    {status === "error" ? t("settings.members.invitationFailedTitle") : t("settings.members.acceptingInvitation")}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {status === "error" ? error : t("settings.members.acceptingInvitationDesc")}
                </p>
                {status === "error" && (
                    <div className="mt-6 flex flex-col gap-2 md:flex-row md:justify-center">
                        <Button className="h-11" onClick={() => void completeInvitation()}>{t("settings.members.retry")}</Button>
                        <Button variant="outline" className="h-11" onClick={() => navigate("/")}>{t("settings.members.backToWorkspace")}</Button>
                    </div>
                )}
            </div>
        </main>
    );
};
