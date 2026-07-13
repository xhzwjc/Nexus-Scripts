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
  evidence?: string | string[] | null;
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
    const valid = dimensions.filter(
      (d) => d.label && d.score != null && d.max_score && d.max_score > 0
    );
    return RADAR_CATEGORIES.map((cat) => {
      const radarScore = radarScores?.find(
        (item) => item.category === cat.key
          && item.score != null
          && Number.isFinite(item.score)
          && item.max_score != null
          && Number.isFinite(item.max_score)
          && item.max_score > 0
      );
      if (radarScore) {
        const rawScore = radarScore.score ?? 0;
        const rawMax = radarScore.max_score ?? 0;
        return {
          subject: isZh ? cat.key : cat.en,
          fullLabel: isZh ? cat.key : cat.en,
          candidate: rawMax > 0 ? Math.max(0, Math.min(100, (rawScore / rawMax) * 100)) : 0,
          benchmark: 80,
          rawScore,
          rawMax,
          reason: radarScore.reason || "",
          evidence: radarScore.evidence || "",
        };
      }

      const catDims = valid.filter(
        (d) => (d.radar_category || inferRadarCategory(d.label!)) === cat.key
      );
      if (catDims.length === 0) {
        return { subject: isZh ? cat.key : cat.en, fullLabel: isZh ? cat.key : cat.en, candidate: 0, benchmark: 80, rawScore: 0, rawMax: 0, reason: "", evidence: "" };
      }
      const totalScore = catDims.reduce((s, d) => s + d.score!, 0);
      const totalMax = catDims.reduce((s, d) => s + d.max_score!, 0);
      const reason = catDims.map((item) => item.reason?.trim()).find(Boolean) || "";
      const evidence = catDims.map((item) => {
        if (Array.isArray(item.evidence)) return item.evidence.find((entry) => typeof entry === "string" && entry.trim()) || "";
        return item.evidence?.trim() || "";
      }).find(Boolean) || "";
      return {
        subject: isZh ? cat.key : cat.en,
        fullLabel: isZh ? cat.key : cat.en,
        candidate: totalMax > 0 ? Math.max(0, Math.min(100, (totalScore / totalMax) * 100)) : 0,
        benchmark: 80,
        rawScore: Math.round(totalScore * 10) / 10,
        rawMax: Math.round(totalMax * 10) / 10,
        reason,
        evidence,
      };
    });
  }, [dimensions, radarScores, isZh]);

  const hasAnyData = chartData.some((d) => d.rawMax > 0);
  if (!hasAnyData) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center rounded-[8px] border border-dashed border-[#E6E7EB] bg-[#F7F8FA] text-[12px] text-[#B0B2B8] dark:border-[#33353D] dark:bg-[#16181B]">
        <Info className="mb-2 h-5 w-5 opacity-60" />
        {uiText.noData}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{uiText.scoreDetails}</p>
        <div className="flex items-center gap-4 text-[11px] text-[#86888F] dark:text-[#B0B2B8]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-[2px] border border-[#1E3BFA] bg-[rgba(30,59,250,0.25)]" />
            {isZh ? "候选人得分" : "Candidate score"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t border-dashed border-[#B0B2B8]" />
            {uiText.benchmark}
          </span>
        </div>
      </div>
      <div className="grid gap-4 rounded-[8px] border border-[#EBEEF5] p-3.5 dark:border-[#33353D] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <div className="flex min-h-[270px] min-w-0 items-center">
          <div className="relative h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="68%" data={chartData}>
                <PolarGrid stroke="#EBEEF5" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: "#33353D", fontSize: 11, fontWeight: 600 }} />
                <Radar name={uiText.benchmark} dataKey="benchmark" stroke="#B0B2B8" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" isAnimationActive={false} />
                <Radar name={isZh ? "候选人得分" : "Candidate score"} dataKey="candidate" stroke="#1E3BFA" strokeWidth={2} fill="#1E3BFA" fillOpacity={0.14} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as { fullLabel: string; rawScore: number; rawMax: number; reason: string; evidence: string };
                      return (
                        <div className="max-w-[280px] rounded-[6px] border border-[#EBEEF5] bg-white p-3 text-[11px] leading-5 text-[#33353D] shadow-[0_8px_24px_rgba(14,17,20,0.12)] dark:border-[#33353D] dark:bg-[#16181B] dark:text-[#D6D8DD]">
                          <p className="mb-1 text-[12px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{data.fullLabel}</p>
                          <p>{isZh ? "得分" : "Score"}: <span className="font-medium">{data.rawMax > 0 ? `${data.rawScore} / ${data.rawMax}` : "-"}</span></p>
                          {data.reason ? <p className="mt-1">{data.reason}</p> : null}
                          {data.evidence ? <p className="mt-1 italic text-[#B0B2B8]">“{data.evidence}”</p> : null}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          {chartData.map((data) => {
            const percent = data.rawMax > 0 ? Math.max(0, Math.min(100, Math.round((data.rawScore / data.rawMax) * 100))) : 0;
            return (
              <div key={data.fullLabel} className="rounded-[6px] bg-[#F7F8FA] px-2.5 py-2 dark:bg-[#16181B]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-[#0E1114] dark:text-[#F7F8FA]">{data.fullLabel}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[#86888F] dark:text-[#B0B2B8]">
                    {data.rawMax > 0 ? `${data.rawScore} / ${data.rawMax}` : "-"}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-[2px] bg-[#EBEEF5] dark:bg-[#33353D]">
                  <div
                    className={cn("h-full rounded-[2px]", percent >= 80 ? "bg-[#0CC991]" : percent >= 60 ? "bg-[#1E3BFA]" : percent >= 40 ? "bg-[#FFAB24]" : "bg-[#F53F3F]")}
                    style={{width: `${percent}%`}}
                  />
                </div>
                {data.reason ? <p className="mt-1 text-[11px] leading-[18px] text-[#5E5F66] dark:text-[#B0B2B8]">{data.reason}</p> : null}
                {data.evidence ? <p className="mt-0.5 text-[11px] italic leading-[18px] text-[#B0B2B8] dark:text-[#86888F]">“{data.evidence}”</p> : null}
              </div>
            );
          })}
        </div>
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
      <div className="flex h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900/45 dark:text-slate-500">
        <Info className="mb-2 h-5 w-5 opacity-60" />
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
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                      <p className="font-bold mb-1">{data.fullLabel}</p>
                      <div className="flex items-center gap-2">
                        <span>{isZh ? "得分" : "Score"}: <span className="font-mono text-neutral-700 dark:text-slate-100">{data.rawScore}/{data.rawMax}</span></span>
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
