"use client";

import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, RefreshCw } from "lucide-react";

import {
  formatSystemVersionPair,
  type SystemBuildInfo,
} from "@/lib/system-version";

type VersionUpdateModalProps = {
  open: boolean;
  reminderVisible: boolean;
  refreshing: boolean;
  currentBuild: SystemBuildInfo;
  latestBuild: SystemBuildInfo;
  onRefresh: () => void;
  onLater: () => void;
};

export function VersionUpdateModal({
  open,
  reminderVisible,
  refreshing,
  currentBuild,
  latestBuild,
  onRefresh,
  onLater,
}: VersionUpdateModalProps) {
  const versionPair = formatSystemVersionPair(currentBuild, latestBuild);
  const reminder = reminderVisible && typeof document !== "undefined"
    ? createPortal(
        <div
          className="fixed bottom-7 right-7 z-[2147483001] flex max-w-[calc(100vw-32px)] items-center gap-3 rounded-[10px] bg-[#0E1114] py-3 pl-3.5 pr-4 text-white shadow-[0_12px_32px_rgba(14,17,20,0.28)] max-sm:bottom-4 max-sm:right-4"
          role="status"
          aria-live="polite"
        >
          <RefreshCw className="h-[18px] w-[18px] shrink-0 text-[#2E9CFF]" strokeWidth={2} />
          <span className="min-w-0 truncate text-[13px] font-normal text-white">
            新版本 {versionPair.latest} 可用
          </span>
          <button
            type="button"
            className="h-7 shrink-0 rounded-[6px] border-0 bg-[#1E3BFA] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#1733D8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            onClick={onRefresh}
          >
            立即刷新
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <DialogPrimitive.Root open={open}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[2147483000] bg-[rgba(15,20,35,0.28)] backdrop-blur-[6px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-[2147483001] w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border-0 bg-white px-11 pb-9 pt-12 text-[#0E1114] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_32px_80px_-12px_rgba(14,17,20,0.28),0_8px_24px_-8px_rgba(14,17,20,0.12)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 max-sm:px-7 max-sm:pb-7 max-sm:pt-9"
            role="alertdialog"
            aria-describedby="system-update-description"
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              if (!refreshing) {
                onLater();
              }
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F4F6FF]">
              <RefreshCw className="h-[26px] w-[26px] text-[#1E3BFA]" strokeWidth={1.8} />
            </div>

            <p className="mt-6 text-center text-[11px] font-semibold tracking-[1.4px] text-[#B0B2B8]">
              NEW VERSION
            </p>
            <DialogPrimitive.Title className="mt-2.5 text-center text-[21px] font-semibold tracking-[-0.3px] text-[#0E1114]">
              已有新版本可用
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              id="system-update-description"
              className="mt-3 text-pretty text-center text-[14px] font-normal leading-[1.7] text-[#86888F]"
            >
              刷新即可载入最新版本。刷新前请确认已保存当前页面的编辑内容。
            </DialogPrimitive.Description>

            <div className="mt-[22px] flex items-center justify-center gap-2.5 tabular-nums">
              <span className="text-[13px] font-normal text-[#B0B2B8]">{versionPair.current}</span>
              <ArrowRight className="h-[15px] w-[15px] shrink-0 text-[#D5D7DD]" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-[#1E3BFA]">{versionPair.latest}</span>
            </div>

            <div className="mt-8 flex flex-col gap-2.5">
              <button
                type="button"
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-xl border-0 bg-[#1E3BFA] text-[14px] font-semibold text-white transition-colors hover:bg-[#1733D8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/30 disabled:cursor-wait disabled:opacity-80"
                onClick={onRefresh}
                disabled={refreshing}
              >
                {refreshing && (
                  <RefreshCw className="h-4 w-4 animate-spin text-white" strokeWidth={2.4} />
                )}
                <span>{refreshing ? "正在更新…" : "刷新以更新"}</span>
              </button>
              <button
                type="button"
                className="h-[42px] w-full rounded-xl border-0 bg-transparent text-[14px] font-medium text-[#86888F] transition-colors hover:bg-[#F7F8FA] hover:text-[#33353D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/20 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onLater}
                disabled={refreshing}
              >
                稍后提醒
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      {reminder}
    </>
  );
}
