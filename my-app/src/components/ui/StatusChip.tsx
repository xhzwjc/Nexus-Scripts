import React from 'react';

export interface StatusChipProps {
    children: React.ReactNode;
    className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ children, className }) => (
    <div
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-md border shadow-sm text-sm leading-none bg-white/40 dark:bg-slate-900/50 backdrop-blur border-white/20 dark:border-white/10 ${className || ''}`}
    >
        {children}
    </div>
);
