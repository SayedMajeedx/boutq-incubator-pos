import React, { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check, FileSignature } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void | Promise<void>;
  isRtl?: boolean;
  isSubmitting?: boolean;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  onSave,
  isRtl = false,
  isSubmitting = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  // Initialize canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
  }, []);

  const getCoordinates = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCoordinates(e.nativeEvent);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const coords = getCoordinates(e.nativeEvent);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;

    const dataUrl = canvas.toDataURL("image/png");
    await onSave(dataUrl);
  };

  return (
    <div className="flex flex-col gap-3 w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-4 shadow-xl select-none">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
          <FileSignature className="w-4 h-4" />
          <span>{isRtl ? "التوقيع الإلكتروني للعقد" : "Contract E-Signature Canvas"}</span>
        </div>
        <span className="text-xs text-slate-400">
          {isRtl ? "وقع إصبعك أو بالماوس داخل المربع" : "Draw with finger or mouse inside canvas"}
        </span>
      </div>

      <div className="relative w-full overflow-hidden bg-slate-950 rounded-xl border border-dashed border-slate-700/80 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          className="w-full h-44 cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {isEmpty && (
          <div className="absolute pointer-events-none text-slate-600 text-sm font-medium flex items-center gap-2">
            <span>{isRtl ? "توقيع المستأجر هنا..." : "Sign Here..."}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs flex items-center gap-1.5"
          onClick={clearCanvas}
          disabled={isEmpty || isSubmitting}
        >
          <Eraser className="w-3.5 h-3.5" />
          <span>{isRtl ? "مسح التوقيع" : "Clear Signature"}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md"
          onClick={handleSave}
          disabled={isEmpty || isSubmitting}
        >
          <Check className="w-3.5 h-3.5" />
          <span>
            {isSubmitting
              ? isRtl
                ? "جاري الحفظ..."
                : "Saving..."
              : isRtl
              ? "حفظ وتوثيق العقد"
              : "Save & Submit Contract"}
          </span>
        </Button>
      </div>
    </div>
  );
};
