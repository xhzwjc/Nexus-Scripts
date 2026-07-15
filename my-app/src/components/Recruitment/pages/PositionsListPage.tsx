"use client";

import React from "react";
import {
    ArrowRight,
    BriefcaseBusiness,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Upload,
    Users,
    Wand2,
} from "lucide-react";

import type {PositionSummary} from "@/lib/recruitment-api";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

import {EmptyState} from "../components/SharedComponents";
import {formatDateTime, labelForPositionStatus} from "../utils";

type PositionsListPageProps = {
    positions: PositionSummary[];
    visiblePositions: PositionSummary[];
    loading: boolean;
    blockStaleData?: boolean;
    query: string;
    statusFilter: string;
    statusLabels: Record<string, string>;
    isZh: boolean;
    showOrganizationColumn: boolean;
    getOrganizationLabel: (orgCode?: string | null) => string;
    organizationControl?: React.ReactNode;
    canManageCandidate: boolean;
    onQueryChange: (value: string) => void;
    onStatusFilterChange: (value: string) => void;
    onCreate: () => void;
    onUpload: () => void;
    onRefresh: () => Promise<void>;
    onOpenPosition: (positionId: number) => void;
    onOpenJD: (positionId: number) => Promise<void> | void;
    onEdit: (positionId: number) => Promise<void> | void;
    onViewCandidates: (positionId: number) => void;
};

function PositionStatusText({status}: { status: string }) {
    const tone = {
        recruiting: "text-[#0A9C71]",
        draft: "text-[#D48806]",
        paused: "text-[#86888F]",
        closed: "text-[#F53F3F]",
    }[status] || "text-[#33353D]";
    return (
        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium", tone)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current"/>
            {labelForPositionStatus(status)}
        </span>
    );
}

export function PositionsListPage({
    positions,
    visiblePositions,
    loading,
    blockStaleData = false,
    query,
    statusFilter,
    statusLabels,
    isZh,
    showOrganizationColumn,
    getOrganizationLabel,
    organizationControl,
    canManageCandidate,
    onQueryChange,
    onStatusFilterChange,
    onCreate,
    onUpload,
    onRefresh,
    onOpenPosition,
    onOpenJD,
    onEdit,
    onViewCandidates,
}: PositionsListPageProps) {
    const [refreshing, setRefreshing] = React.useState(false);
    const [departmentFilter, setDepartmentFilter] = React.useState("all");
    const [employmentFilter, setEmploymentFilter] = React.useState("all");
    const [creatorFilter, setCreatorFilter] = React.useState("all");
    const dataBlocked = loading || blockStaleData;
    const availablePositions = dataBlocked ? [] : positions;
    const availableVisiblePositions = dataBlocked ? [] : visiblePositions;

    const departments = React.useMemo(
        () => Array.from(new Set(availablePositions.map((item) => String(item.department || "").trim()).filter(Boolean))).sort(),
        [availablePositions],
    );
    const employmentTypes = React.useMemo(
        () => Array.from(new Set(availablePositions.map((item) => String(item.employment_type || "").trim()).filter(Boolean))).sort(),
        [availablePositions],
    );
    const creators = React.useMemo(
        () => Array.from(new Set(availablePositions.map((item) => String(item.created_by || "").trim()).filter(Boolean))).sort(),
        [availablePositions],
    );
    const displayedPositions = React.useMemo(
        () => availableVisiblePositions.filter((position) => (
            (departmentFilter === "all" || position.department === departmentFilter)
            && (employmentFilter === "all" || position.employment_type === employmentFilter)
            && (creatorFilter === "all" || position.created_by === creatorFilter)
        )),
        [availableVisiblePositions, creatorFilter, departmentFilter, employmentFilter],
    );

    const stats = {
        recruiting: availablePositions.filter((item) => item.status === "recruiting").length,
        paused: availablePositions.filter((item) => item.status === "paused").length,
        all: availablePositions.length,
    };
    const hasSecondaryFilters = departmentFilter !== "all" || employmentFilter !== "all" || creatorFilter !== "all";
    const selectClass = "h-8 rounded-[4px] border border-[#E6E7EB] bg-white px-3 text-[12px] text-[#33353D] outline-none transition hover:border-[#1E3BFA]/50 focus:border-[#1E3BFA] focus:ring-2 focus:ring-[#1E3BFA]/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200";

    const clearFilters = () => {
        onStatusFilterChange("all");
        setDepartmentFilter("all");
        setEmploymentFilter("all");
        setCreatorFilter("all");
        onQueryChange("");
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-[#0E1114] dark:bg-slate-950 dark:text-slate-100">
            <div className="shrink-0 px-5 pb-3 pt-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-white">
                            <BriefcaseBusiness className="h-[15px] w-[15px]" strokeWidth={1.8}/>
                        </span>
                        <div className="min-w-0">
                            <h1 className="text-[18px] font-semibold leading-6">{isZh ? "岗位管理" : "Positions"}</h1>
                            <p className="mt-0.5 truncate text-[11px] text-[#86888F]">
                                {isZh ? "维护招聘需求、岗位信息、JD、评估方案和候选人。" : "Manage hiring requests, position details, JDs, assessment plans, and candidates."}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {organizationControl}
                        <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] text-white shadow-none hover:bg-[#0F23D9]" onClick={onCreate}>
                            <Plus className="h-4 w-4"/>{isZh ? "新建岗位" : "New Position"}
                        </Button>
                        {canManageCandidate ? (
                            <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-4 text-[13px] text-white shadow-none hover:bg-[#0F23D9]" onClick={onUpload}>
                                <Upload className="h-4 w-4"/>{isZh ? "上传简历" : "Upload Resumes"}
                            </Button>
                        ) : null}
                        <Button
                            variant="outline"
                            className="h-9 rounded-[6px] border-[#1E3BFA] px-3 text-[13px] text-[#1E3BFA] shadow-none hover:bg-[#1E3BFA]/5 hover:text-[#1E3BFA]"
                            disabled={refreshing || loading}
                            onClick={async () => {
                                setRefreshing(true);
                                try {
                                    await onRefresh();
                                } finally {
                                    setRefreshing(false);
                                }
                            }}
                        >
                            {refreshing || loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                            {isZh ? "刷新" : "Refresh"}
                        </Button>
                    </div>
                </div>

                <div className="mt-4 grid max-w-[1048px] gap-4 sm:grid-cols-3">
                    {[
                        {key: "recruiting", label: isZh ? "招聘中岗位" : "Recruiting", value: stats.recruiting},
                        {key: "paused", label: isZh ? "暂停中" : "Paused", value: stats.paused},
                        {key: "all", label: isZh ? "全部岗位" : "All Positions", value: stats.all},
                    ].map((item) => {
                        const active = statusFilter === item.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                className={cn(
                                    "rounded-[8px] border bg-white px-5 py-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/25 dark:bg-slate-950",
                                    active ? "border-[#1E3BFA]" : "border-[#EBEEF5] hover:border-[#1E3BFA]/35 dark:border-slate-800",
                                )}
                                onClick={() => onStatusFilterChange(item.key)}
                            >
                                <span className="flex items-center gap-2 text-[12px] text-[#33353D] dark:text-slate-300">
                                    <span className={cn("h-3 w-[3px] rounded-full", active ? "bg-[#1E3BFA]" : "bg-[#B0B2B8]")}/>{item.label}
                                </span>
                                <span className="mt-1.5 block text-[28px] font-semibold leading-8 tabular-nums">{dataBlocked ? "—" : item.value}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <select className={selectClass} value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} aria-label={isZh ? "岗位状态" : "Position status"}>
                            <option value="all">{isZh ? "全部状态" : "All statuses"}</option>
                            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <select className={selectClass} value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} aria-label={isZh ? "需求部门" : "Department"}>
                            <option value="all">{isZh ? "全部部门" : "All departments"}</option>
                            {departments.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                        <select className={selectClass} value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value)} aria-label={isZh ? "用工类型" : "Employment type"}>
                            <option value="all">{isZh ? "全部用工类型" : "All employment types"}</option>
                            {employmentTypes.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                        {creators.length ? (
                            <select className={selectClass} value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)} aria-label={isZh ? "创建人" : "Creator"}>
                                <option value="all">{isZh ? "全部创建人" : "All creators"}</option>
                                {creators.map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                        ) : null}
                        {statusFilter !== "all" || hasSecondaryFilters || query ? (
                            <button type="button" className="text-[12px] text-[#0F23D9] hover:text-[#1E3BFA]" onClick={clearFilters}>
                                {isZh ? "清空已选" : "Clear filters"}
                            </button>
                        ) : null}
                    </div>
                    <div className="relative w-full sm:w-[340px]">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]"/>
                        <Input
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder={isZh ? "搜索岗位名称、部门或地点" : "Search title, department, or location"}
                            className="h-8 rounded-[4px] border-[#E6E7EB] pl-9 text-[12px] shadow-none focus-visible:border-[#1E3BFA] focus-visible:ring-[#1E3BFA]/10"
                        />
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto border-t border-[#F2F3F5] px-5 pb-6 md:px-8">
                {loading ? (
                    <div className="flex h-56 items-center justify-center gap-2 text-[13px] text-[#86888F]"><Loader2 className="h-4 w-4 animate-spin"/>{isZh ? "正在加载岗位" : "Loading positions"}</div>
                ) : blockStaleData ? (
                    <div className="flex h-56 items-center justify-center text-center text-[13px] text-[#86888F]">
                        {isZh ? "岗位已保存，但最新列表加载失败，请点击刷新重试" : "The position was saved, but the latest list could not be loaded. Refresh to try again."}
                    </div>
                ) : displayedPositions.length ? (
                    <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-[12px]">
                        <colgroup>
                            <col style={{width: showOrganizationColumn ? "11%" : "13%"}}/>
                            {showOrganizationColumn ? <col style={{width: "11%"}}/> : null}
                            <col style={{width: showOrganizationColumn ? "9%" : "10%"}}/>
                            <col style={{width: showOrganizationColumn ? "7.5%" : "8%"}}/>
                            <col style={{width: showOrganizationColumn ? "8%" : "9%"}}/>
                            <col style={{width: showOrganizationColumn ? "9%" : "10%"}}/>
                            <col style={{width: showOrganizationColumn ? "6%" : "7%"}}/>
                            <col style={{width: showOrganizationColumn ? "7%" : "8%"}}/>
                            <col style={{width: showOrganizationColumn ? "7%" : "8%"}}/>
                            <col style={{width: showOrganizationColumn ? "9%" : "11%"}}/>
                            <col style={{width: showOrganizationColumn ? "15.5%" : "16%"}}/>
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-white text-[#86888F] dark:bg-slate-950 dark:text-slate-400">
                            <tr className="h-10 border-b border-[#F2F3F5] dark:border-slate-800">
                                <th className="px-2 font-normal">{isZh ? "岗位名称" : "Position"}</th>
                                {showOrganizationColumn ? <th className="px-2 font-normal">{isZh ? "组织" : "Organization"}</th> : null}
                                <th className="px-2 font-normal">{isZh ? "部门" : "Department"}</th>
                                <th className="px-2 font-normal">{isZh ? "地点" : "Location"}</th>
                                <th className="px-2 font-normal">{isZh ? "用工类型" : "Employment"}</th>
                                <th className="px-2 font-normal">{isZh ? "薪资范围" : "Salary"}</th>
                                <th className="px-2 font-normal">{isZh ? "候选人数" : "Candidates"}</th>
                                <th className="px-2 font-normal">{isZh ? "自动初筛" : "Auto Screen"}</th>
                                <th className="px-2 font-normal">{isZh ? "状态" : "Status"}</th>
                                <th className="px-2 text-right font-normal">{isZh ? "更新时间" : "Updated"}</th>
                                <th className="px-2 font-normal">
                                    <span className="ml-auto block w-[172px] text-left">{isZh ? "操作" : "Actions"}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedPositions.map((position) => (
                                <tr key={position.id} className="h-[46px] border-b border-[#F2F3F5] text-[#0F1014] transition hover:bg-[#F8F8F9] dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                                    <td className="max-w-[150px] px-2">
                                        <button type="button" className="block max-w-full truncate font-medium text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => onOpenPosition(position.id)} title={position.title}>
                                            {position.title}
                                        </button>
                                    </td>
                                    {showOrganizationColumn ? <td className="max-w-[150px] truncate px-2" title={getOrganizationLabel(position.org_code)}>{getOrganizationLabel(position.org_code)}</td> : null}
                                    <td className="max-w-[120px] truncate px-2" title={position.department || "-"}>{position.department || "-"}</td>
                                    <td className="max-w-[100px] truncate px-2" title={position.location || "-"}>{position.location || "-"}</td>
                                    <td className="max-w-[112px] truncate px-2" title={position.employment_type || "-"}>{position.employment_type || "-"}</td>
                                    <td className="whitespace-nowrap px-2">{position.salary_range || "-"}</td>
                                    <td className="px-2 tabular-nums">
                                        <button type="button" className="inline-flex items-center gap-1 text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => onViewCandidates(position.id)}>
                                            <Users className="h-3.5 w-3.5"/>{position.candidate_count}
                                        </button>
                                    </td>
                                    <td className="px-2">
                                        <span className={cn(
                                            "inline-flex h-[22px] items-center rounded-[4px] px-2 text-[11px]",
                                            position.auto_screen_on_upload ? "bg-[#0CC991]/10 text-[#0A9C71]" : "bg-[#B0B2B8]/10 text-[#86888F]",
                                        )}>{position.auto_screen_on_upload ? (isZh ? "已开启" : "On") : (isZh ? "未开启" : "Off")}</span>
                                    </td>
                                    <td className="px-2"><PositionStatusText status={position.status}/></td>
                                    <td className="whitespace-nowrap px-2 text-right text-[#86888F]">{formatDateTime(position.updated_at || position.created_at)}</td>
                                    <td className="px-2">
                                        <div className="ml-auto flex w-[172px] items-center justify-between whitespace-nowrap">
                                            <button type="button" className="inline-flex items-center gap-1 text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => void onOpenJD(position.id)}><Wand2 className="h-3.5 w-3.5"/>{isZh ? "JD 配置" : "JD"}</button>
                                            <button type="button" className="inline-flex items-center gap-1 text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => void onEdit(position.id)}><Pencil className="h-3.5 w-3.5"/>{isZh ? "编辑" : "Edit"}</button>
                                            <button type="button" className="inline-flex items-center gap-1 text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => onOpenPosition(position.id)}>{isZh ? "详情" : "Details"}<ArrowRight className="h-3.5 w-3.5"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="py-16"><EmptyState title={isZh ? "暂无符合条件的岗位" : "No matching positions"} description={isZh ? "调整筛选条件，或新建一条招聘需求。" : "Adjust the filters or create a hiring request."}/></div>
                )}
                {!dataBlocked ? (
                    <div className="flex items-center justify-between border-t border-[#F2F3F5] py-4 text-[12px] text-[#86888F] dark:border-slate-800">
                        <span>{isZh ? `共 ${displayedPositions.length} 个岗位` : `${displayedPositions.length} positions`}</span>
                        <span>{isZh ? "已显示当前筛选下的全部岗位" : "Showing all positions for the current filters"}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
