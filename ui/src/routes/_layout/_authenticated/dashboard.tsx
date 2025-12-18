import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client";
import { apiClient } from "../../../utils/orpc";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";

export const Route = createFileRoute("/_layout/_authenticated/dashboard")({
  component: AuthenticatedHome,
});

function AuthenticatedHome() {
  const [protectedData, setProtectedData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [kvKey, setKvKey] = useState("mykey");
  const [kvValue, setKvValue] = useState("myvalue");
  const [kvResult, setKvResult] = useState<any>(null);

  const accountId = authClient.near.getAccountId();

  const handleCallProtected = async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.protected();
      setProtectedData(result);
      toast.success("Protected endpoint called successfully!");
    } catch (error: any) {
      console.error("Error calling protected:", error);
      toast.error(error.message || "Failed to call protected endpoint");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetValue = async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.setValue({ key: kvKey, value: kvValue });
      setKvResult(result);
      toast.success(`Key "${kvKey}" ${result.created ? 'created' : 'updated'}!`);
    } catch (error: any) {
      console.error("Error setting value:", error);
      toast.error(error.message || "Failed to set value");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetValue = async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.getValue({ key: kvKey });
      setKvResult(result);
      toast.success(`Retrieved value for "${kvKey}"`);
    } catch (error: any) {
      console.error("Error getting value:", error);
      toast.error(error.message || "Failed to get value");
      setKvResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      window.location.href = "/login";
    } catch (error) {
      console.error("Sign out error:", error);
      toast.error("Failed to sign out");
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Authenticated Dashboard</h1>
            <p className="text-muted-foreground">
              Signed in as: <span className="font-mono">{accountId}</span>
            </p>
          </div>
          <Button onClick={handleSignOut} variant="outline">
            Sign Out
          </Button>
        </div>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Protected Endpoint Test</h2>
          <p className="text-sm text-muted-foreground mb-4">
            This button calls the protected API endpoint that requires authentication.
          </p>
          <Button 
            onClick={handleCallProtected} 
            disabled={isLoading}
            className="mb-4"
          >
            {isLoading ? "Loading..." : "Call Protected Endpoint"}
          </Button>
          
          {protectedData && (
            <div className="mt-4 p-4 bg-muted rounded-md">
              <pre className="text-sm overflow-auto">
                {JSON.stringify(protectedData, null, 2)}
              </pre>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Key-Value Store</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Store and retrieve values using the authenticated API.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Key</label>
              <input
                type="text"
                value={kvKey}
                onChange={(e) => setKvKey(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Enter key"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Value</label>
              <input
                type="text"
                value={kvValue}
                onChange={(e) => setKvValue(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Enter value"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleSetValue} 
                disabled={isLoading || !kvKey || !kvValue}
              >
                Set Value
              </Button>
              <Button 
                onClick={handleGetValue} 
                disabled={isLoading || !kvKey}
                variant="outline"
              >
                Get Value
              </Button>
            </div>

            {kvResult && (
              <div className="mt-4 p-4 bg-muted rounded-md">
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(kvResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
