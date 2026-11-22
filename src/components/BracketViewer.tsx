"use client";
import { useEffect, useRef, useState } from "react";

type ViewerWindow = Window & {
  bracketsViewer?: {
    render: (data: unknown, config?: Record<string, unknown>) => Promise<void>;
    participantRefs: Record<string, HTMLElement[]>;
  };
};

type RoundNameInfo = {
  groupType: string;
  fractionOfFinal?: number;
};

const roundName = (info: RoundNameInfo): string => {
  if (info.groupType === "final-group") return "За 3-е место";
  if (info.groupType === "single_bracket") {
    return info.fractionOfFinal === 1 ? "Финал" : `1/${Math.round(1 / (info.fractionOfFinal ?? 1))}`;
  }
  return "";
};

/** Публичная сетка на brackets-viewer.js (UMD-бандл грузится на клиенте, тема — в globals.css, .ugp-bracket). */
export default function BracketViewer({ data, highlightedAthleteId }: { data: unknown; highlightedAthleteId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await import("brackets-viewer/dist/brackets-viewer.min.js");
        const viewer = (window as ViewerWindow).bracketsViewer;
        if (cancelled || !ref.current || !viewer) return;
        await viewer.render(data, {
          clear: true,
          participantOriginPlacement: "none",
          showSlotsOrigin: false,
          customRoundName: roundName,
        });
        const refs = (highlightedAthleteId && viewer.participantRefs[highlightedAthleteId]) || [];
        refs.forEach((el) => el.classList.add("bv-highlight"));
        refs[0]?.scrollIntoView({ block: "center" });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, highlightedAthleteId]);

  if (failed) return <p className="text-sm text-[#8a8378]">Не удалось загрузить сетку. Обновите страницу.</p>;
  return <div ref={ref} className="brackets-viewer ugp-bracket" />;
}
