"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

type VersionUpdateModalProps = {
  visible: boolean;
};

export function VersionUpdateModal({ visible }: VersionUpdateModalProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="version-update-title"
      aria-describedby="version-update-description"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 shadow-[0_32px_90px_-35px_rgba(15,23,42,0.65)] dark:border-slate-800/80 dark:bg-slate-950/95">
        <div className="relative overflow-hidden px-7 pb-6 pt-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-300/35 blur-3xl dark:bg-sky-500/20" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-52 w-52 rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-500/15" />
          <div className="relative space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:bg-slate-100 dark:text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 id="version-update-title" className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                  系统已更新
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">刷新后即可使用最新版本</p>
              </div>
            </div>
            <div id="version-update-description" className="space-y-3 text-base leading-7 text-slate-600 dark:text-slate-300">
              <p>检测到新版本已发布啦，为避免页面异常，请刷新后继续使用。</p>
              <p className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                当前进行中的后台任务不会中断，结果仍会保存。
              </p>
            </div>
            <Button
              className="h-12 w-full rounded-2xl bg-slate-900 text-base text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4" />
              立即刷新
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
