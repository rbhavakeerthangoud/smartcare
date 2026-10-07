"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BrandMark from "@/app/components/brand-mark";
import NotificationCenter from "@/app/components/notification-center";
import {
  canAccessRolePath,
  dashboardPathForRole,
} from "@/lib/smartcare/role-navigation";
import { AuthProvider, useSmartCareAuth } from "@/lib/supabase/auth-context";
import type { SmartCareRole } from "@/lib/supabase/auth-context";

type Theme = "light" | "dark";

function roleNavigation(role: SmartCareRole) {
  switch (role) {
    case "PATIENT":
      return [
        { href: "/", label: "Dashboard" },
        { href: "/#care-plans", label: "My care plan" },
        { href: "/#tasks", label: "Tasks" },
        { href: "/#upcoming-care", label: "Upcoming" },
        { href: "/#documents", label: "Documents" },
        { href: "/#profile", label: "Profile" },
        { href: "/#care-team", label: "Care team" },
        { href: "/#measurements", label: "Measurements" },
      ];
    case "CAREGIVER":
      return [{ href: "/caregiver", label: "Care overview" }];
    case "CLINICIAN":
      return [
        { href: "/clinical", label: "Clinical overview" },
        { href: "/research", label: "Research analytics" },
        { href: "/care-plans/new", label: "Create care plan" },
      ];
    case "ADMIN":
      return [
        { href: "/admin", label: "System overview" },
        { href: "/clinical", label: "Clinical workspace" },
        { href: "/caregiver", label: "Caregiver workspace" },
        { href: "/research", label: "Research analytics" },
        { href: "/care-plans/new", label: "Create care plan" },
      ];
  }
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, role, loading, roleLoading, roleError, signOut } =
    useSmartCareAuth();
  const [signOutError, setSignOutError] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const isLogin = pathname === "/login";
  const homeForRole = role ? dashboardPathForRole(role) : null;

  useEffect(() => {
    if (!loading && !session && !isLogin) router.replace("/login");
  }, [isLogin, loading, router, session]);

  useEffect(() => {
    if (pathname === "/" && homeForRole && homeForRole !== "/") {
      router.replace(homeForRole);
    }
  }, [homeForRole, pathname, router]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("smartcare-theme");
    const nextTheme: Theme = storedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    if (nextTheme !== "light") {
      const timer = window.setTimeout(() => setTheme(nextTheme), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  if (isLogin) return children;

  if (loading || !session || roleLoading) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-slate-600">
        <div className="text-center">
          <BrandMark />
          <p className="mt-4">Preparing your secure workspace…</p>
        </div>
      </main>
    );
  }

  if (roleError || !role) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <section className="sc-panel max-w-lg rounded-2xl p-8">
          <BrandMark />
          <h1 className="mt-6 text-xl font-semibold">Workspace access needs setup</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your signed-in account needs an assigned SmartCare role. Ask your project
            administrator to check your account and patient access.
          </p>
          <button
            type="button"
            onClick={() => void signOut().catch(() => setSignOutError("Could not sign out. Please retry."))}
            className="mt-6 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign out
          </button>
          {signOutError && <p role="alert" className="mt-3 text-sm text-red-700">{signOutError}</p>}
        </section>
      </main>
    );
  }

  if (!canAccessRolePath(role, pathname)) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <section className="sc-panel max-w-lg rounded-2xl p-8">
          <h1 className="text-xl font-semibold">You don’t have access to this workspace</h1>
          <p className="mt-3 text-sm text-slate-600">
            Your role does not include this area. Return to your authorized dashboard.
          </p>
          <Link href={homeForRole || "/"} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800">
            Return to your dashboard
          </Link>
        </section>
      </main>
    );
  }

  if (pathname === "/" && homeForRole && homeForRole !== "/") {
    return (
      <main className="grid min-h-[60vh] place-items-center text-sm text-slate-600">
        Opening your workspace…
      </main>
    );
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("smartcare-theme", nextTheme);
    setTheme(nextTheme);
  }

  async function handleSignOut() {
    setSignOutError("");
    try {
      await signOut();
      router.replace("/login");
    } catch {
      setSignOutError("Could not sign out. Please retry.");
    }
  }

  const navigation = roleNavigation(role);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={homeForRole || "/"} aria-label="SmartCare home" className="shrink-0">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationCenter userId={session.user.id} role={role} />
            <span className="hidden rounded-md bg-slate-100 px-2.5 py-1.5 text-[0.68rem] font-semibold tracking-wide text-slate-600 sm:inline">
              {role}
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-10 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:px-3"
            >
              Sign out
            </button>
          </div>
        </nav>
        <div className="border-t border-slate-100 px-4 py-2 lg:hidden">
          <nav aria-label="Main navigation" className="flex gap-2 overflow-x-auto">
            {navigation.map((item) => (
              <NavigationLink key={item.href} item={item} pathname={pathname} compact />
            ))}
          </nav>
        </div>
        {signOutError && (
          <p role="alert" className="mx-auto max-w-7xl px-6 pb-3 text-sm text-red-700">
            {signOutError}
          </p>
        )}
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-[4.25rem] hidden h-[calc(100vh-4.25rem)] w-64 shrink-0 flex-col border-r border-slate-200 px-4 py-6 lg:flex">
          <p className="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>
          <nav aria-label="Workspace navigation" className="mt-3 space-y-1">
            {navigation.map((item) => (
              <NavigationLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
          <div className="mt-auto rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">Care, connected.</p>
            <p className="mt-1 text-xs leading-5 text-emerald-900/80">
              Your care information is shown according to your assigned access.
            </p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function NavigationLink({
  item,
  pathname,
  compact = false,
}: {
  item: { href: string; label: string };
  pathname: string;
  compact?: boolean;
}) {
  const active =
    item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
        compact ? "shrink-0" : "w-full"
      } ${
        active
          ? "bg-emerald-100 text-emerald-950"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-emerald-700" : "bg-slate-300"
        }`}
      />
      {item.label}
    </Link>
  );
}

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ShellContent>{children}</ShellContent>
    </AuthProvider>
  );
}
