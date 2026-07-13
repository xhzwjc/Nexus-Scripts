import type {RecruitmentPage} from "./types";

export type PaginatedSettingsResponse<T> = {
    items: T[];
    total: number;
    limit: number;
    offset: number;
};

export type SettingsListResponse<T> = T[] | PaginatedSettingsResponse<T>;

export type SettingsListQuery = {
    limit: number;
    offset: number;
    summary?: boolean;
    query?: string;
    taskType?: string;
    orgCodes?: string[];
};

export function normalizeSettingsListResponse<T>(
    response: SettingsListResponse<T>,
    fallbackLimit: number,
    fallbackOffset: number,
): PaginatedSettingsResponse<T> {
    if (Array.isArray(response)) {
        return {
            items: response,
            total: response.length,
            limit: fallbackLimit,
            offset: fallbackOffset,
        };
    }
    return {
        items: Array.isArray(response.items) ? response.items : [],
        total: Number.isFinite(response.total) ? Math.max(0, response.total) : 0,
        limit: Number.isFinite(response.limit) ? Math.max(1, response.limit) : fallbackLimit,
        offset: Number.isFinite(response.offset) ? Math.max(0, response.offset) : fallbackOffset,
    };
}

export function buildSettingsListQuery({
    limit,
    offset,
    summary = true,
    query,
    taskType,
    orgCodes,
}: SettingsListQuery): string {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        summary: String(summary),
    });
    const normalizedQuery = query?.trim();
    const normalizedTaskType = taskType?.trim();
    if (normalizedQuery) {
        params.set("query", normalizedQuery);
    }
    if (normalizedTaskType && normalizedTaskType !== "all") {
        params.set("task_type", normalizedTaskType);
    }
    (orgCodes || []).map((orgCode) => orgCode.trim()).filter(Boolean).forEach((orgCode) => {
        params.append("org_code", orgCode);
    });
    return params.toString();
}

export function isRecruitmentSettingsPage(page: RecruitmentPage): boolean {
    return page === "settings-mail" || page === "settings-models" || page === "settings-skills";
}

export function shouldBootstrapRecruitmentCore(page: RecruitmentPage, canUseRecruitmentWorkspace: boolean): boolean {
    return canUseRecruitmentWorkspace && !isRecruitmentSettingsPage(page);
}
