import { useState } from "react";
import ScanningScreen from "./ScanningScreen";

type ScanResult = {
  rawValue?: string;
  format?: string;
};

export default function App() {
  const [result, setResult] = useState<ScanResult | null>(null);

  if (result) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto flex max-w-md flex-col gap-4 rounded-xl border border-white/10 bg-neutral-950 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-2xl text-emerald-400">
            ✓
          </div>

          <div>
            <h1 className="text-2xl font-semibold">Scan Successful</h1>
            <p className="mt-2 text-sm text-white/70">
              The barcode or QR code was recognized successfully.
            </p>
          </div>

          <div className="rounded-lg border border-white/10 p-4">
            <div className="text-sm text-white/60">Scanned Value</div>
            <div className="mt-2 break-all text-base">{result.rawValue ?? "No value returned"}</div>
          </div>

          <div className="rounded-lg border border-white/10 p-4">
            <div className="text-sm text-white/60">Format</div>
            <div className="mt-2 text-base">{result.format ?? "Unknown"}</div>
          </div>

          <button
            type="button"
            onClick={() => setResult(null)}
            className="rounded-lg bg-emerald-500 px-4 py-3 text-base font-medium text-black"
          >
            Scan Again
          </button>
        </div>
      </main>
    );
  }

  return <ScanningScreen onDetected={setResult} />;
}
