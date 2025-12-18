import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_checkout")({
  component: MarketplaceLayout,
});

function MarketplaceLayout() {
  return (
    <div className="bg-background min-h-screen w-full font-['Red_Hat_Mono',monospace]">
      <main>
        <Outlet />
      </main>
    </div>
  );
}
