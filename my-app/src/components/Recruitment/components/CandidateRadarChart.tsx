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
import { Info } from "lucide-react";

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
  isZh: boolean;
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

export const CandidateRadarChart = ({ dimensions, isZh, uiText }: CandidateRadarChartProps) => {
  const chartData = useMemo(() => {
    const valid = dimensions.filter(
      (d) => d.label && d.score != null && d.max_score && d.max_score > 0
    );

    return RADAR_CATEGORIES.map((cat) => {
      const catDims = valid.filter(
        (d) => (d.radar_category || inferRadarCategory(d.label!)) === cat.key
      );
      if (catDims.length === 0) {
        return {
          subject: isZh ? cat.key : cat.en,
          fullLabel: cat.key,
          candidate: 0,
          benchmark: 80,
          rawScore: 0,
          rawMax: 0,
          subDims: [] as CandidateScoreDimension[],
        };
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
        subDims: catDims,
      };
    });
  }, [dimensions, isZh]);

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
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: "#64748b", fontSize: 12 }}
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
                  const data = payload[0].payload as {
                    fullLabel: string;
                    rawScore: number;
                    rawMax: number;
                    subDims: CandidateScoreDimension[];
                  };
                  return (
                    <div className="bg-white p-3 shadow-xl border rounded-lg text-xs dark:bg-slate-950 max-w-[280px]">
                      <p className="font-bold mb-1">{data.fullLabel}</p>
                      <div className="mb-2">
                        {isZh ? "得分" : "Score"}:{" "}
                        <span className="text-blue-600 font-mono">
                          {data.rawScore}/{data.rawMax}
                        </span>
                      </div>
                      {data.subDims.length > 0 && (
                        <div className="border-t pt-2 space-y-1">
                          {data.subDims.map((d, i) => (
                            <div key={i} className="flex justify-between gap-2">
                              <span className="text-slate-600 truncate">
                                {d.label}
                              </span>
                              <span className="font-mono shrink-0">
                                {d.score}/{d.max_score}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
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
  );
};
