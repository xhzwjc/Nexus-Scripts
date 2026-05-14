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

interface RadarScoreItem {
  category?: string | null;
  score?: number | null;
  max_score?: number | null;
  reason?: string | null;
  evidence?: string | null;
}

interface CandidateScoreDimension {
  label?: string | null;
  score?: number | null;
  max_score?: number | null;
  reason?: string | null;
  is_inferred?: boolean | null;
  radar_category?: string | null;
}

interface CandidateRadarChartProps {
  dimensions: CandidateScoreDimension[];
  radarScores?: RadarScoreItem[] | null;
  isZh: boolean;
  mode?: "aggregated" | "individual";
  uiText: {
    scoreDetails: string;
    coreSkills: string;
    otherSkills: string;
    noData: string;
    benchmark: string;
  };
}

const RADAR_CATEGORIES = [
  { key: "专业能力", en: "Professional Skills" },
  { key: "学习潜力", en: "Learning Potential" },
  { key: "工作经验", en: "Work Experience" },
  { key: "综合素质", en: "Comprehensive Quality" },
  { key: "岗位匹配度", en: "Position Match" },
];

function inferRadarCategory(label: string): string {
  if (/测试|开发|编程|技术|架构|协议|自动化|工具|框架|SDK|API|硬件|固件|嵌入式|IoT|能力|专业|技能|测试能力/i.test(label)) return "专业能力";
  if (/学历|教育|学校|学位|学习|成长|项目复杂/i.test(label)) return "学习潜力";
  if (/年限|经验|行业|工作|从业|职业|履历|工作年限/i.test(label)) return "工作经验";
  if (/沟通|团队|稳定|领导|软技能|文化|态度|抗压|综合素质/i.test(label)) return "综合素质";
  if (/匹配|契合|生态|领域|行业经验|整体|岗位匹配/i.test(label)) return "岗位匹配度";
  return "综合素质";
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

function AggregatedRadar({ dimensions, radarScores, isZh, uiText }: { dimensions: CandidateScoreDimension[]; radarScores?: RadarScoreItem[] | null; isZh: boolean; uiText: CandidateRadarChartProps["uiText"] }) {
  const chartData = useMemo(() => {
    // Prefer AI-generated radar_scores
    if (radarScores && radarScores.length > 0) {
      return RADAR_CATEGORIES.map((cat) => {
        const rs = radarScores.find((r) => r.category === cat.key);
        if (!rs || rs.max_score == null || rs.max_score <= 0) {
          return { subject: isZh ? cat.key : cat.en, fullLabel: cat.key, candidate: 0, benchmark: 80, rawScore: 0, rawMax: 0, reason: "", evidence: "" };
        }
        return {
          subject: isZh ? cat.key : cat.en,
          fullLabel: cat.key,
          candidate: (rs.score! / rs.max_score!) * 100,
          benchmark: 80,
          rawScore: rs.score ?? 0,
          rawMax: rs.max_score ?? 0,
          reason: rs.reason || "",
          evidence: rs.evidence || "",
        };
      });
    }

    // Fallback: aggregate from dimensions
    const valid = dimensions.filter(
      (d) => d.label && d.score != null && d.max_score && d.max_score > 0
    );
    return RADAR_CATEGORIES.map((cat) => {
      const catDims = valid.filter(
        (d) => (d.radar_category || inferRadarCategory(d.label!)) === cat.key
      );
      if (catDims.length === 0) {
        return { subject: isZh ? cat.key : cat.en, fullLabel: cat.key, candidate: 0, benchmark: 80, rawScore: 0, rawMax: 0, reason: "", evidence: "" };
      }
      const totalScore = catDims.reduce((s, d) => s + d.score!, 0);
      const totalMax = catDims.reduce((s, d) => s + d.max_score!, 0);
      return {
        subject: isZh ? cat.key : cat.en,
        fullLabel: cat.key,
        candidate: totalMax > 0 ? (totalScore / totalMax) * 100 : 0,
        benchmark: 80,
        rawScore: Math.round(totalScore * 10) / 10,
        rawMax: Math.round(totalMax * 10) / 10,
        reason: "",
        evidence: "",
      };
    });
  }, [dimensions, radarScores, isZh]);

  const hasAnyData = chartData.some((d) => d.rawMax > 0);
  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] border border-dashed rounded-xl bg-slate-50/50 text-slate-400 text-sm">
        <Info className="h-5 w-5 mb-2 opacity-50" />
        {uiText.noData}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="w-full h-[320px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 12 }} />
            <Radar name={uiText.benchmark} dataKey="benchmark" stroke="#94a3b8" strokeDasharray="4 4" fill="transparent" isAnimationActive={false} />
            <Radar name={isZh ? "候选人得分" : "Score"} dataKey="candidate" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.5} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as { fullLabel: string; rawScore: number; rawMax: number; reason: string; evidence: string };
                  return (
                    <div className="bg-white p-3 shadow-xl border rounded-lg text-xs dark:bg-slate-950 max-w-[280px]">
                      <p className="font-bold mb-1">{data.fullLabel}</p>
                      <div className="mb-1">
                        {isZh ? "得分" : "Score"}: <span className="text-blue-600 font-mono">{data.rawScore}/{data.rawMax}</span>
                      </div>
                      {data.reason && <p className="text-slate-600 mt-1">{data.reason}</p>}
                      {data.evidence && <p className="text-slate-400 mt-1 italic">"{data.evidence}"</p>}
                    </div>
                  );
                }
                return null;
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {/* 五维评分详情 */}
      <div className="px-1 pb-2 space-y-2">
        {chartData.map((d, i) => {
          if (d.rawMax <= 0) return null;
          const percent = Math.round((d.rawScore / d.rawMax) * 100);
          return (
            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-900/30">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{d.fullLabel}</span>
                <span className="text-xs font-mono text-slate-500">{d.rawScore}/{d.rawMax}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all ${percent >= 80 ? "bg-emerald-500" : percent >= 60 ? "bg-blue-500" : percent >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              {d.reason ? <p className="mt-1.5 text-[11px] leading-5 text-slate-600 dark:text-slate-400">{d.reason}</p> : <p className="mt-1.5 text-[11px] leading-5 text-slate-400 italic">{isZh ? "暂无评分说明" : "No rating explanation"}</p>}
              {d.evidence && <p className="mt-0.5 text-[11px] leading-5 text-slate-400 dark:text-slate-500 italic">"{d.evidence}"</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IndividualRadar({ dimensions, isZh, uiText }: { dimensions: CandidateScoreDimension[]; isZh: boolean; uiText: CandidateRadarChartProps["uiText"] }) {
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
            <Radar name={uiText.benchmark} dataKey="benchmark" stroke="#94a3b8" strokeDasharray="4 4" fill="transparent" isAnimationActive={false} />
            <Radar name={isZh ? "候选人得分" : "Score"} dataKey="candidate" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.5} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = (payload[0] as { payload: { fullLabel: string; rawScore: number; rawMax: number; isInferred?: boolean | null } }).payload;
                  return (
                    <div className="bg-white p-3 shadow-xl border rounded-lg text-xs dark:bg-slate-950">
                      <p className="font-bold mb-1">{data.fullLabel}</p>
                      <div className="flex items-center gap-2">
                        <span>{isZh ? "得分" : "Score"}: <span className="text-blue-600 font-mono">{data.rawScore}/{data.rawMax}</span></span>
                        {data.isInferred && <Badge variant="outline" className="scale-75">{isZh ? "系统推断" : "Inferred"}</Badge>}
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
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">{uiText.otherSkills}</p>
          <div className="flex flex-wrap gap-2">
            {overflowDims.map((dim, idx) => {
              const normScore = dim.max_score! > 0 ? (dim.score! / dim.max_score!) * 100 : 0;
              return (
                <Badge key={idx} variant="secondary" className={cn("text-[11px] font-normal", normScore < 40 && "text-red-500")}>
                  {dim.label}: {dim.score}/{dim.max_score}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const CandidateRadarChart = ({ dimensions, radarScores, isZh, mode = "aggregated", uiText }: CandidateRadarChartProps) => {
  if (mode === "individual") {
    return <IndividualRadar dimensions={dimensions} isZh={isZh} uiText={uiText} />;
  }
  return <AggregatedRadar dimensions={dimensions} radarScores={radarScores} isZh={isZh} uiText={uiText} />;
};
