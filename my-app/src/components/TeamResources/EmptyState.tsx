import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title?: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={`col-span-full text-center py-20 text-muted-foreground ${className || ''}`}>
            {Icon && <Icon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />}
            {title && <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{title}</h3>}
            {description && <p>{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
