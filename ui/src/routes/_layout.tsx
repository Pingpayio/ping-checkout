import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { useState, useEffect } from "react";
import { ThemeToggle } from "../components/theme-toggle";

export const Route = createFileRoute("/_layout")({
  component: Layout,
});

function Layout() {
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: session } = await authClient.getSession();
      setAccountId(session?.user?.id || null);
    };
    checkAuth();
  }, []);

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      setAccountId(null);
      window.location.href = "/";
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <div className="bg-background min-h-screen w-full flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-xl font-bold">
              NEAR App
            </Link>
            
            <nav className="flex items-center gap-4">
              <ThemeToggle />
              {accountId ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    {accountId}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-sm hover:underline"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link to="/login" className="text-sm hover:underline">
                  Login
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          <p className="text-sm text-muted-foreground text-center">
            © 2025 NEAR App. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
