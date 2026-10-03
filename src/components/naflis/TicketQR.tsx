import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Renders `value` as a QR code image. */
export function TicketQR({ value, size = 200 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" }).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt="Ticket QR code" className="rounded-lg bg-white p-2" />
  ) : (
    <div style={{ width: size, height: size }} className="grid place-items-center rounded-lg bg-muted">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Camera scanner using the browser's BarcodeDetector (Chrome / Edge / Android).
 * Where it isn't available the gate falls back to typing the code.
 */
export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let last = "";
    const detector: Detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current || stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue;
            // Debounce: the same code stays in frame for many ticks.
            if (value && value !== last) {
              last = value;
              onScan(value);
              setTimeout(() => (last = ""), 2500);
            }
          } catch {
            // frame not ready
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Camera access was blocked. Allow it, or type the code below.");
        setActive(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, onScan]);

  if (!supported) {
    return <p className="text-xs text-muted-foreground">Camera scanning isn't supported in this browser — type the code instead.</p>;
  }
  return (
    <div className="space-y-2">
      {active && <video ref={videoRef} muted playsInline className="aspect-square w-full max-w-xs rounded-xl bg-black object-cover" />}
      <Button size="sm" variant="outline" onClick={() => { setError(null); setActive((v) => !v); }}>
        {active ? <CameraOff className="mr-1 h-4 w-4" /> : <Camera className="mr-1 h-4 w-4" />} {active ? "Stop camera" : "Scan with camera"}
      </Button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
