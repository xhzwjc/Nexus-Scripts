"use client";

import React from "react";

import {cn} from "@/lib/utils";
import {Card} from "@/components/ui/card";

import type {AssistantDisplayMode} from "../types";

type AssistantPageProps = {
    panelClass: string;
    assistantOpen: boolean;
    renderAssistantSuspendedState: () => React.ReactNode;
    renderAssistantConsole: (mode: AssistantDisplayMode) => React.ReactNode;
};

export function AssistantPage({
    panelClass,
    assistantOpen,
    renderAssistantSuspendedState,
    renderAssistantConsole,
}: AssistantPageProps) {
    return (
        <Card className={cn(panelClass, "h-full min-h-0 overflow-hidden")}>
            {assistantOpen ? renderAssistantSuspendedState() : renderAssistantConsole("page")}
        </Card>
    );
}
