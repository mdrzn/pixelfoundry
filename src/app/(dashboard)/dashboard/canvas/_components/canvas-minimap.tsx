"use client";

import { MiniMap } from "@xyflow/react";

export function CanvasMinimap() {
  return (
    <MiniMap
      nodeStrokeWidth={3}
      maskColor="rgba(0, 0, 0, 0.1)"
      className="!bottom-4 !right-4 !rounded-lg !border !shadow-md"
      pannable
      zoomable
    />
  );
}
