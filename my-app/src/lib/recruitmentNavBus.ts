/**
 * 全局导航事件总线，用于 DashboardSidebar 与 RecruitmentAutomationContainer 之间的跨组件通信。
 */
export const recruitmentNavBus = new EventTarget();

export function navigateToRecruitmentPage(page: string) {
    recruitmentNavBus.dispatchEvent(new CustomEvent('navigate', { detail: page }));
}
