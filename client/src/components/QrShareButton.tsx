import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Pause, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpTip } from "@/components/HelpTip";
import { encodeFrames } from "@/lib/sessionTransfer";
import type { Cable, Circuit } from "@shared/schema";

// How long each frame stays on screen. Slow enough for a phone to lock focus,
// quick enough that a ten-frame project cycles in a few seconds.
const FRAME_INTERVAL_MS = 600;

// Drawn size of the code. This is not cosmetic: at 460px a full frame did not
// decode back at all, and only cleared about 5 px per module from a perfect
// render. 720px with FRAME_PAYLOAD_LIMIT-sized frames gives ~8 px per module,
// which survives a camera resolving the code at a fraction of screen
// resolution. Error correction M over L for the same reason.
const QR_PIXELS = 720;

type QrShareButtonProps = {
  mode: "fiber" | "copper";
  cables: Cable[];
  circuits: Circuit[];
  spliceName?: string | null;
  helpMode?: boolean;
};

export function QrShareButton({ mode, cables, circuits, spliceName, helpMode = false }: QrShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Build the frames when the dialog opens, so the code always reflects the
  // project as it stands right now.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setError(null);
    setCurrent(0);
    setPaused(false);

    encodeFrames({ mode, cables, circuits, spliceName: spliceName?.trim() || null })
      .then(next => {
        if (!cancelled) setFrames(next);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not build the QR code.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, cables, circuits, spliceName]);

  // Advance through the frames. A single-frame project just sits still.
  useEffect(() => {
    if (!open || paused || frames.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrent(prev => (prev + 1) % frames.length);
    }, FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open, paused, frames.length]);

  // Paint the current frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frames[current];
    if (!canvas || !frame) return;

    QRCode.toCanvas(canvas, frame, {
      errorCorrectionLevel: "M",
      width: QR_PIXELS,
      margin: 2,
      // Always light-on-dark-modules: a QR inverted for dark mode will not scan.
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(err => {
      setError(err instanceof Error ? err.message : "Could not draw the QR code.");
    });
  }, [frames, current]);

  const step = useCallback(
    (delta: number) => {
      setPaused(true);
      setCurrent(prev => (prev + delta + frames.length) % frames.length);
    },
    [frames.length]
  );

  const multiFrame = frames.length > 1;
  const isEmpty = cables.length === 0 && circuits.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <HelpTip
        text="Show this project as a QR code so the phone app can scan it in."
        enabled={helpMode}
        side="bottom"
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isEmpty}
            title={isEmpty ? "Nothing to share yet" : "Share this project to the phone app"}
            data-testid="button-qr-share"
          >
            <QrCode className="h-4 w-4 mr-2" />
            Share
          </Button>
        </DialogTrigger>
      </HelpTip>

      <DialogContent className="max-w-[min(96vw,820px)]" data-testid="dialog-qr-share">
        <DialogHeader>
          <DialogTitle>Scan with the phone app</DialogTitle>
          <DialogDescription>
            {multiFrame
              ? `This project needs ${frames.length} codes. Point the phone at the screen and hold it there — the codes cycle automatically and the app collects them until it has the whole project.`
              : "Point the phone app's scanner at this code to load the project."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {error ? (
            <div className="py-10 text-center text-sm text-destructive" data-testid="text-qr-error">
              {error}
            </div>
          ) : frames.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Preparing code...</div>
          ) : (
            <>
              {/* White plate so the code stays scannable in dark mode. */}
              <div className="rounded-lg bg-white p-3">
                <canvas
                  ref={canvasRef}
                  className="h-auto w-full"
                  style={{ maxWidth: QR_PIXELS }}
                  data-testid="canvas-qr"
                />
              </div>

              {multiFrame && (
                <div className="flex w-full items-center justify-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => step(-1)}
                    title="Previous code"
                    data-testid="button-qr-prev"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaused(p => !p)}
                    data-testid="button-qr-pause"
                  >
                    {paused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
                    {paused ? "Resume" : "Pause"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => step(1)}
                    title="Next code"
                    data-testid="button-qr-next"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="text-xs text-muted-foreground" data-testid="text-qr-progress">
                {multiFrame ? `Code ${current + 1} of ${frames.length}` : "Single code"}
                {" · "}
                {cables.length} cable{cables.length === 1 ? "" : "s"}, {circuits.length} circuit
                {circuits.length === 1 ? "" : "s"}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
