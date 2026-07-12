"use client";

import React from "react";
import {LockKeyhole, Settings} from "lucide-react";

import {cn} from "@/lib/utils";
import {useI18n} from "@/lib/i18n";

import type {RecruitmentPage} from "../types";

export type RecruitmentSettingsPage = Extract<RecruitmentPage, "settings-mail" | "settings-models" | "settings-skills">;

type SettingsPageLayoutProps = {
    activePage: RecruitmentSettingsPage;
    canAccessMail: boolean;
    canAccessModels: boolean;
    canAccessSkills: boolean;
    onNavigate: (page: RecruitmentSettingsPage) => void;
    children: React.ReactNode;
};

export function SettingsPageLayout({
    activePage,
    canAccessMail,
    canAccessModels,
    canAccessSkills,
    onNavigate,
    children,
}: SettingsPageLayoutProps) {
    const {language} = useI18n();
    const isZh = language === "zh-CN";
    const tabs = [
        {page: "settings-mail" as const, label: isZh ? "邮件配置" : "Mail", accessible: canAccessMail},
        {page: "settings-models" as const, label: isZh ? "模型配置" : "Models", accessible: canAccessModels},
        {page: "settings-skills" as const, label: isZh ? "评估方案" : "Assessment Plans", accessible: canAccessSkills},
    ];

    return (
        <div className="min-h-full bg-white px-5 pb-12 pt-4 text-[#0E1114] dark:bg-slate-950 dark:text-slate-100 lg:px-8 2xl:px-10">
            <div className="mx-auto w-full max-w-[1680px]">
                <nav aria-label={isZh ? "设置分类" : "Settings sections"} className="mb-6 flex min-h-12 items-stretch gap-1 border-b border-transparent">
                    <div className="mr-1 flex items-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-white shadow-none">
                            <Settings className="h-4 w-4" aria-hidden="true"/>
                        </span>
                    </div>
                    {tabs.map((tab) => {
                        const active = tab.page === activePage;
                        const permissionHint = isZh
                            ? `当前账号缺少${tab.label}查看权限`
                            : `Your account does not have permission to view ${tab.label}`;
                        return (
                            <button
                                key={tab.page}
                                type="button"
                                aria-current={active ? "page" : undefined}
                                aria-disabled={!tab.accessible}
                                disabled={!tab.accessible}
                                title={tab.accessible ? tab.label : permissionHint}
                                className={cn(
                                    "relative flex h-12 items-center gap-1.5 border-0 bg-transparent px-4 text-[15px] outline-none transition-colors after:absolute after:bottom-0 after:left-1/2 after:h-[3px] after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-transparent focus:outline-none focus-visible:outline-none",
                                    !tab.accessible
                                        ? "cursor-not-allowed font-normal text-[#B0B2B8] dark:text-slate-600"
                                        : active
                                        ? "font-semibold text-[#0E1114] after:bg-[#1E3BFA] dark:text-white"
                                        : "font-normal text-[#33353D] hover:text-[#0F23D9] dark:text-slate-300 dark:hover:text-blue-300",
                                )}
                                onClick={() => onNavigate(tab.page)}
                            >
                                {tab.label}
                                {!tab.accessible ? <LockKeyhole className="h-3 w-3" aria-hidden="true"/> : null}
                            </button>
                        );
                    })}
                </nav>
                {children}
            </div>
        </div>
    );
}
