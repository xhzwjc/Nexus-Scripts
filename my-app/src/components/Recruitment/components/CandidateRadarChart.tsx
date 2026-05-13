"use client";

import React, { useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

interface CandidateScoreDimension {
  label?: string | null;
  score?: number | null;
  max_score?: number | null;
  reason?: string | null;
  is_inferred?: boolean | null;
}

interface CandidateRadarChartProps {
  dimensions: CandidateScoreDimension[];
  isZh: boolean;
  uiText: {
    scoreDetails: string;
    coreSkills: string;
    otherSkills: string;
    noData: string;
    benchmark: string;
  };
}

const HorizontalBarsOnly = ({ dimensions }: { dimensions: CandidateScoreDimension[] }) => (
  <div className="space-y-4 p-4">
    {dimensions.map((d, i) => (
      <div key={i} className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="font-medium text-slate-700 dark:text-slate-300">{d.label}</span>
          <span className="text-slate-500">{d.score}/{d.max_score}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-teal-500"
            style={{ width: `${d.max_score ? (d.score! / d.max_score!) * 100 : 0}%` }}
          />
        </div>
      </div>
    ))}
  </div>
);

export const CandidateRadarChart = ({ dimensions, isZh, uiText }: CandidateRadarChartProps) => {
  const { validDims, displayDims, overflowDims } = useMemo(() => {
    const valid = dimensions.filter(
      (d) => d.label && d.score != null && d.max_score && d.max_score > 0
    );

    const allSorted = [...valid].sort((a, b) => {
      if (b.max_score !== a.max_score) return b.max_score! - a.max_score!;
      return b.score! - a.score!;
    });

    const MAX_DISPLAY = 9;
    return {
      validDims: valid,
      displayDims: allSorted.slice(0, MAX_DISPLAY),
      overflowDims: allSorted.slice(MAX_DISPLAY),
    };
  }, [dimensions]);

  if (validDims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] border border-dashed rounded-xl bg-slate-50/50 text-slate-400 text-sm">
        <Info className="h-5 w-5 mb-2 opacity-50" />
        {uiText.noData}
      </div>
    );
  }

  if (validDims.length <= 2) {
    return <HorizontalBarsOnly dimensions={validDims} />;
  }

  const chartData = displayDims.map((d) => {
    const count = displayDims.length;
    const label = d.label!;
    const displayLabel = count > 6 && label.length > 6 ? `${label.slice(0, 6)}..` : label;

    return {
      subject: displayLabel,
      fullLabel: label,
      candidate: (d.score! / d.max_score!) * 100,
      benchmark: 80,
      rawScore: d.score,
      rawMax: d.max_score,
      isInferred: d.is_inferred,
    };
  });

  const getOuterRadius = (count: number) => {
    if (count >= 9) return "60%";
    if (count >= 7) return "70%";
    return "75%";
  };

  const handleDimClick = (label: string) => {
    const el = document.querySelector(`[data-dim-reason="${label}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex flex-col w-full">
      <div className="w-full h-[320px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius={getOuterRadius(chartData.length)} data={chartData}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: "#64748b", fontSize: chartData.length > 8 ? 10 : 12 }}
              onClick={(data: { value: string }) => handleDimClick(data.value)}
              className="cursor-pointer"
            />
            <Radar
              name={uiText.benchmark}
              dataKey="benchmark"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              fill="transparent"
              isAnimationActive={false}
            />
            <Radar
              name={isZh ? "候选人得分" : "Score"}
              dataKey="candidate"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="#3b82f6"
              fillOpacity={0.5}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = (payload[0] as { payload: { fullLabel: string; rawScore: number; rawMax: number; isInferred?: boolean | null } }).payload;
                  return (
                    <div className="bg-white p-3 shadow-xl border rounded-lg text-xs dark:bg-slate-950">
                      <p className="font-bold mb-1">{data.fullLabel}</p>
                      <div className="flex items-center gap-2">
                        <span>得分: <span className="text-blue-600 font-mono">{data.rawScore}/{data.rawMax}</span></span>
                        {data.isInferred && <Badge variant="outline" className="scale-75">系统推断</Badge>}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {overflowDims.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
            {uiText.otherSkills}
          </p>
          <div className="flex flex-wrap gap-2">
            {overflowDims.map((dim, idx) => {
              const normScore = dim.max_score! > 0 ? (dim.score! / dim.max_score!) * 100 : 0;
              return (
                <Badge
                  key={idx}
                  variant="secondary"
                  className={cn(
                    "text-[11px] font-normal",
                    normScore < 40 && "text-red-500"
                  )}
                >
                  {dim.label}: {dim.score}/{dim.max_score}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
