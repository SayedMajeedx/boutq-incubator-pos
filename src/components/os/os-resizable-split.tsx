import React, { useEffect, useState } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { getPanelWidth, setPanelWidth } from "@/lib/os-productivity";

interface OsResizableSplitProps {
  id: string;
  direction?: "horizontal" | "vertical";
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultLeftSize?: number;
  minLeftSize?: number;
  maxLeftSize?: number;
  className?: string;
}

export function OsResizableSplit({
  id,
  direction = "horizontal",
  leftPanel,
  rightPanel,
  defaultLeftSize = 35,
  minLeftSize = 20,
  maxLeftSize = 70,
  className,
}: OsResizableSplitProps) {
  const [leftSize, setLeftSize] = useState<number>(defaultLeftSize);

  useEffect(() => {
    const saved = getPanelWidth(id, defaultLeftSize);
    setLeftSize(saved);
  }, [id, defaultLeftSize]);

  const groupProps: any = {
    direction,
    onLayout: (sizes: number[]) => {
      if (sizes[0] !== undefined) {
        setPanelWidth(id, sizes[0]);
      }
    },
  };

  return (
    <ResizablePanelGroup {...groupProps} className={cn("w-full h-full min-h-0", className)}>
      {/* Primary / Left Panel */}
      <ResizablePanel
        defaultSize={leftSize}
        minSize={minLeftSize}
        maxSize={maxLeftSize}
        className="min-h-0 overflow-auto scrollbar-none"
      >
        {leftPanel}
      </ResizablePanel>

      {/* Resizable Handle */}
      <ResizableHandle withHandle className="hover:bg-primary/20 transition-colors" />

      {/* Secondary / Right Panel */}
      <ResizablePanel className="min-h-0 overflow-auto scrollbar-none">{rightPanel}</ResizablePanel>
    </ResizablePanelGroup>
  );
}
