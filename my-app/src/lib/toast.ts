import { toast as sonnerToast, type ExternalToast } from "sonner";

const DEFAULT_FEEDBACK_TOAST_ID = "app-global-feedback";

function hasExplicitToastId(data?: ExternalToast): boolean {
    if (!data) {
        return false;
    }
    const value = data.id;
    return value !== undefined && value !== null && String(value).trim() !== "";
}

function withDefaultToastId(data?: ExternalToast): ExternalToast {
    if (hasExplicitToastId(data)) {
        return data as ExternalToast;
    }
    return {
        ...data,
        id: DEFAULT_FEEDBACK_TOAST_ID,
    };
}

type ToastHandler = (message: Parameters<typeof sonnerToast>[0], data?: ExternalToast) => string | number;

function withStableId(handler: ToastHandler): ToastHandler {
    return (message, data) => handler(message, withDefaultToastId(data));
}

const baseToast = ((message: Parameters<typeof sonnerToast>[0], data?: ExternalToast) => (
    sonnerToast(message, withDefaultToastId(data))
)) as typeof sonnerToast;

baseToast.success = withStableId(sonnerToast.success);
baseToast.info = withStableId(sonnerToast.info);
baseToast.warning = withStableId(sonnerToast.warning);
baseToast.error = withStableId(sonnerToast.error);
baseToast.message = withStableId(sonnerToast.message);
baseToast.loading = withStableId(sonnerToast.loading);
baseToast.custom = sonnerToast.custom;
baseToast.promise = sonnerToast.promise;
baseToast.dismiss = sonnerToast.dismiss;
baseToast.getHistory = sonnerToast.getHistory;
baseToast.getToasts = sonnerToast.getToasts;

export const toast = baseToast;
