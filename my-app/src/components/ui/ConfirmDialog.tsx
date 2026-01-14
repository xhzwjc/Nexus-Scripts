'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';

export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    description,
    confirmText = '确认',
    cancelText = '取消',
    onConfirm,
    onCancel
}) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
            <div className="relative w-full max-w-sm p-4">
                <Card className="animate-fadeIn">
                    <CardHeader>
                        <CardTitle className="text-lg">{title}</CardTitle>
                        {description && <CardDescription>{description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={onCancel}>{cancelText}</Button>
                            <Button onClick={onConfirm}>{confirmText}</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
