"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_PERSONAS, type DemoPersona } from "@/lib/demo";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ---------------------------------------------------------------------------
// Demo persona picker (only rendered when NEXT_PUBLIC_DEMO_MODE=true)
// ---------------------------------------------------------------------------

function DemoPersonaPicker() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handlePickPersona(persona: DemoPersona) {
    setLoading(persona.userId);
    setError("");
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: persona.userId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(data.redirect || "/home");
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-dashed border-amber-400/50" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-amber-500 font-semibold">
            Demo Mode — Pick a persona
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {DEMO_PERSONAS.map((persona) => (
          <button
            key={persona.userId}
            onClick={() => handlePickPersona(persona)}
            disabled={loading !== null}
            className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/60 hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {/* Avatar */}
            <span
              className={`${persona.color} flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold`}
            >
              {persona.fullName.split(" ").map((n) => n[0]).join("")}
            </span>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {persona.fullName}
                </span>
                <span className="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono">
                  {persona.role}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {persona.description}
              </p>
            </div>

            {/* Loading indicator */}
            {loading === persona.userId && (
              <svg
                className="h-4 w-4 flex-shrink-0 animate-spin text-primary"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <p className="text-xs text-muted-foreground text-center pt-1">
        No password required · fictional data only · safe for demos
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dev admin login form (non-demo dev environments)
// ---------------------------------------------------------------------------

function DevLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 404) {
        setError("Dev login not available in this environment");
        return;
      }
      const data = await res.json();
      if (data.success) {
        router.push(data.redirect || "/home");
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            Development Only
          </span>
        </div>
      </div>
      <form onSubmit={handleDevLogin} className="space-y-3">
        <Input
          type="password"
          placeholder="Dev admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={loading || !password}
        >
          {loading ? "Signing in..." : "Dev Login"}
        </Button>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 px-4">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src="/revenueiq-logo.svg" alt="RevenueIQ" className="h-10 mx-auto" />
          <h1 className="text-3xl font-bold tracking-tight text-primary">RevenueIQ</h1>
          <p className="text-muted-foreground">Enterprise Sales Performance Platform</p>
          {IS_DEMO && (
            <span className="inline-block rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-0.5 text-xs font-medium text-amber-500">
              Demo Mode · Fictional Data
            </span>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Sign In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {IS_DEMO ? (
              // Demo mode: show persona picker only, hide Okta button
              <DemoPersonaPicker />
            ) : (
              // Production / dev: show Okta SSO + dev login
              <>
                <Button
                  className="w-full"
                  variant="default"
                  onClick={() => (window.location.href = "/api/auth/saml/login")}
                >
                  Sign in with Okta
                </Button>
                <DevLoginForm />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
