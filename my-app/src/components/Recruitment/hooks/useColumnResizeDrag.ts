import React from "react";

type ColumnResizeDragOptions = {
    currentWidth: number;
    maxWidth: number;
    minWidth: number;
    setWidth: React.Dispatch<React.SetStateAction<number>>;
};

export function useColumnResizeDrag({
    currentWidth,
    maxWidth,
    minWidth,
    setWidth,
}: ColumnResizeDragOptions) {
    const cleanupRef = React.useRef<(() => void) | null>(null);

    React.useEffect(() => () => {
        cleanupRef.current?.();
    }, []);

    return React.useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        cleanupRef.current?.();

        const startX = event.clientX;
        const startWidth = currentWidth;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        let cleaned = false;

        const normalizeWidth = (width: number) => Math.max(
            minWidth,
            Math.min(maxWidth, width),
        );

        const handlePointerMove = (moveEvent: PointerEvent) => {
            setWidth(normalizeWidth(startWidth + moveEvent.clientX - startX));
        };

        const cleanup = () => {
            if (cleaned) {
                return;
            }
            cleaned = true;
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", cleanup);
            window.removeEventListener("pointercancel", cleanup);
            if (cleanupRef.current === cleanup) {
                cleanupRef.current = null;
            }
        };

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", cleanup, {once: true});
        window.addEventListener("pointercancel", cleanup, {once: true});
        cleanupRef.current = cleanup;
    }, [currentWidth, maxWidth, minWidth, setWidth]);
}
