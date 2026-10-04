"use client";

import { useEffect } from "react";
import { recordRecent } from "@/lib/recent-views";

/** Notes that this person opened this page, for the palette's "Recently viewed". Renders nothing. */
export function RecordView({ userId, slug }: { userId: string; slug: string }) {
  useEffect(() => {
    recordRecent(userId, slug);
  }, [userId, slug]);
  return null;
}
