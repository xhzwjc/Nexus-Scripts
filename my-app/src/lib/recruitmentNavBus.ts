/**
 * 全局导航事件总线，用于 DashboardSidebar 与 RecruitmentAutomationContainer 之间的跨组件通信。
 */
export const recruitmentNavBus = new EventTarget();

export type RecruitmentNavigationEventDetail = {
    page: string;
    replace?: boolean;
};

export function resolveRecruitmentNavigationDetail(
    detail: string | RecruitmentNavigationEventDetail,
): RecruitmentNavigationEventDetail {
    if (typeof detail === 'string') {
        return { page: detail };
    }
    return {
        page: detail.page,
        replace: Boolean(detail.replace),
    };
}

export function resolveRecruitmentPageDetail(detail: string | RecruitmentNavigationEventDetail): string {
    return resolveRecruitmentNavigationDetail(detail).page;
}

export function navigateToRecruitmentPage(page: string, options: { replace?: boolean } = {}) {
    recruitmentNavBus.dispatchEvent(new CustomEvent<RecruitmentNavigationEventDetail>('navigate', {
        detail: {
            page,
            replace: options.replace,
        },
    }));
}

export function syncRecruitmentActivePage(page: string) {
    recruitmentNavBus.dispatchEvent(new CustomEvent<RecruitmentNavigationEventDetail>('page-sync', {
        detail: { page },
    }));
}
