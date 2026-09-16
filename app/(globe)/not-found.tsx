import Link from "next/link";

// Minimal by design: the globe root layout is dark, full-height and
// overflow-hidden, so a 404 here is one centred block and nothing else.
export default function GlobeNotFound() {
  return (
    <main className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <h1 className="hud-display text-lg tracking-widest">404</h1>
        <p className="mt-2 text-xs opacity-70">No such view.</p>
        <p className="mt-4 text-xs">
          <Link href="/" className="underline">
            Back to the globe
          </Link>
        </p>
      </div>
    </main>
  );
}
