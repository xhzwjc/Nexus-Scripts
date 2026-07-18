"use client";

import React from "react";
import {UserRound} from "lucide-react";

import {cn} from "@/lib/utils";
import type {CandidateDisplayIdentity} from "../candidateIdentity";

type CandidateAvatarProps = {
    identity: CandidateDisplayIdentity;
    className?: string;
    iconClassName?: string;
    style?: React.CSSProperties;
};

export function CandidateAvatar({identity, className, iconClassName, style}: CandidateAvatarProps) {
    const hasLabel = Boolean(identity.avatarLabel);
    return (
        <span
            aria-hidden="true"
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full",
                className,
                !hasLabel && "bg-[#B0B2B8] text-white",
            )}
            style={hasLabel ? style : undefined}
        >
            {identity.avatarLabel || (
                <UserRound className={cn("h-1/2 w-1/2", iconClassName)} strokeWidth={1.9}/>
            )}
        </span>
    );
}
