import React from 'react';

export interface StatusChipProps {
    children: React.ReactNode;
    className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ children, className }) => (
    <div
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-md border bg-white/40 backdrop-blur shadow-sm text-sm leading-none ${className || ''}`}
    >
        {children}
    </div>
);
