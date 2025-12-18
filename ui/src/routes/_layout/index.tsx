import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient } from "../../lib/auth-client";
import { useState, useEffect } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

export const Route = createFileRoute("/_layout/")({
  component: Home,
});

function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: session } = await authClient.getSession();
      setIsAuthenticated(!!session?.user);
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Welcome to NEAR App</h1>
        <p className="text-lg text-muted-foreground">
          A simple authenticated application with NEAR Protocol integration
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-3">Login</h2>
          <p className="text-muted-foreground mb-6">
            Connect your NEAR wallet to access authenticated features
          </p>
          <Link to="/login">
            <Button className="w-full">
              Go to Login
            </Button>
          </Link>
        </Card>

        {isAuthenticated && (
          <Card className="p-6 border-primary">
            <h2 className="text-2xl font-semibold mb-3">Dashboard</h2>
            <p className="text-muted-foreground mb-6">
              Access your authenticated dashboard with protected API calls
            </p>
            <Link to="/dashboard">
              <Button className="w-full" variant="default">
                Go to Dashboard
              </Button>
            </Link>
          </Card>
        )}
      </div>

    </div>
  );
}
