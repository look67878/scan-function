import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException, type Result } from "@zxing/library";
import { useEffect, useRef, useState } from "react";

type DetectorResult = {
  rawValue?: string;
  format?: string;
};

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): {
        detect: (source: ImageBitmapSource) => Promise<DetectorResult[]>;
      };
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

const BASE_FORMATS = [
  "aztec",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "qr_code",
  "upc_a",
  "upc_e",
] as const;

function playSuccessTone() {
  const AudioContextClass = window.AudioContext || (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.08;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.12);

  oscillator.onended = () => {
    void audioContext.close();
  };
}

type ScanningScreenProps = {
  onDetected: (result: DetectorResult) => void;
};

export default function ScanningScreen({ onDetected }: ScanningScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect: (source: ImageBitmapSource) => Promise<DetectorResult[]> } | null>(null);
  const fallbackReaderRef = useRef<{ reader: BrowserMultiFormatReader; stop: () => void } | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastValueRef = useRef<string>("");
  const stoppedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [barcodeSupported, setBarcodeSupported] = useState<boolean | null>(null);
  const [result, setResult] = useState<DetectorResult | null>(null);
  const [status, setStatus] = useState("Press Start Scanner to begin.");
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!started) {
      return;
    }

    let mounted = true;

    const stopLoop = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const stopFallbackReader = () => {
      fallbackReaderRef.current?.stop();
      fallbackReaderRef.current = null;
    };

    const cleanup = () => {
      stoppedRef.current = true;
      stopLoop();
      stopFallbackReader();
      stopStream();
    };

    const triggerSuccessFeedback = (detected: DetectorResult) => {
      setResult(detected);
      setStatus("Code detected successfully.");
      setFlash(true);
      window.setTimeout(() => setFlash(false), 220);

      if ("vibrate" in navigator) {
        navigator.vibrate(180);
      }

      playSuccessTone();
      window.setTimeout(() => {
        if (mounted) {
          onDetected(detected);
        }
      }, 300);
    };

    const scanFrame = async () => {
      if (
        stoppedRef.current ||
        !mounted ||
        !videoRef.current ||
        !detectorRef.current ||
        videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        frameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      try {
        const detections = await detectorRef.current.detect(videoRef.current);
        const first = detections[0];

        if (first?.rawValue && first.rawValue !== lastValueRef.current) {
          lastValueRef.current = first.rawValue;
          triggerSuccessFeedback(first);
        }
      } catch {
        setStatus("Camera is live. Recognition is trying again...");
      }

      frameRef.current = requestAnimationFrame(scanFrame);
    };

    const startFallbackScanner = async () => {
      if (!videoRef.current) {
        return;
      }

      try {
        const hints = new Map<DecodeHintType, BarcodeFormat[]>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.AZTEC,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.PDF_417,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
        ]);

        const reader = new BrowserMultiFormatReader(hints);

        if (mounted) {
          setBarcodeSupported(false);
          setStatus("Camera is live. Using fallback recognition for this browser.");
        }

        const controls = await reader.decodeFromStream(
          streamRef.current!,
          videoRef.current,
          (scanResult: Result | undefined, scanError: unknown) => {
          if (stoppedRef.current || !mounted) {
            return;
          }

          if (scanResult) {
            const rawValue = scanResult.getText();

            if (rawValue && rawValue !== lastValueRef.current) {
              lastValueRef.current = rawValue;
              triggerSuccessFeedback({
                rawValue,
                format: BarcodeFormat[scanResult.getBarcodeFormat()] ?? "unknown",
              });
            }
            return;
          }

          if (scanError && !(scanError instanceof NotFoundException)) {
            setStatus("Camera is live. Fallback recognition is trying again...");
          }
          }
        );

        fallbackReaderRef.current = {
          reader,
          stop: controls.stop,
        };
      } catch {
        if (mounted) {
          setBarcodeSupported(false);
          setStatus("Camera is live, but fallback recognition could not start.");
        }
      }
    };

    const setupDetector = async () => {
      if (!window.BarcodeDetector) {
        await startFallbackScanner();
        return;
      }

      try {
        const supportedFormats = await window.BarcodeDetector.getSupportedFormats?.();
        const formats = supportedFormats?.length
          ? BASE_FORMATS.filter((format) => supportedFormats.includes(format))
          : [...BASE_FORMATS];

        detectorRef.current = new window.BarcodeDetector({
          formats: formats.length > 0 ? [...formats] : ["qr_code"],
        });

        if (mounted) {
          setBarcodeSupported(true);
          setStatus("Camera is live. Point it at a barcode or QR code.");
        }

        frameRef.current = requestAnimationFrame(scanFrame);
      } catch {
        await startFallbackScanner();
      }
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        if (!mounted || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (mounted) {
          setCameraReady(true);
          setStatus("Camera is live. Checking barcode support...");
        }

        await setupDetector();
      } catch (cameraError) {
        if (mounted) {
          setError(
            cameraError instanceof Error
              ? cameraError.message
              : "Unable to access the camera."
          );
          setStatus("Could not open the camera.");
        }
      }
    };

    void startCamera();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [onDetected, started]);

  return (
    <main className="min-h-screen bg-black p-4 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold">Scanner</h1>
        <p className="text-sm text-white/70">{status}</p>

        {!started && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setResult(null);
              setBarcodeSupported(null);
              setCameraReady(false);
              setStatus("Requesting camera access...");
              setStarted(true);
            }}
            className="rounded-lg bg-emerald-500 px-4 py-3 text-base font-medium text-black"
          >
            Start Scanner
          </button>
        )}

        {started && (
          <>
            <div className="relative overflow-hidden rounded-lg bg-neutral-900">
              <video ref={videoRef} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 border border-white/20" />
              <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400" />
              {flash && <div className="absolute inset-0 bg-emerald-400/30" />}
            </div>

            <div className="rounded-lg border border-white/10 p-3 text-sm">
              <div>Camera: {cameraReady ? "on" : "waiting"}</div>
              <div>
                Recognition:{" "}
                {barcodeSupported === null && "checking"}
                {barcodeSupported === true && "supported"}
                {barcodeSupported === false && "not supported in this browser"}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-3">
              <div className="text-sm text-white/60">Result</div>
              <div className="mt-2 break-all text-base">{result?.rawValue ?? "No code detected yet"}</div>
              {result?.format && <div className="mt-1 text-sm text-white/60">Format: {result.format}</div>}
            </div>
          </>
        )}

        {error && <div className="rounded-lg border border-red-500/40 p-3 text-sm text-red-200">{error}</div>}
      </div>
    </main>
  );
}
