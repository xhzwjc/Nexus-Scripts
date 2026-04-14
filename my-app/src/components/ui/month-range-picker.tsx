"use client"

import * as React from "react"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Button } from "./button"
import { cn } from "@/lib/utils"

interface MonthRangePickerProps {
    startMonth: string
    endMonth: string
    onStartMonthChange: (value: string) => void
    onEndMonthChange: (value: string) => void
    className?: string
}

const MONTHS = [
    "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月"
]

export function MonthRangePicker({
    startMonth,
    endMonth,
    onStartMonthChange,
    onEndMonthChange,
    className,
}: MonthRangePickerProps) {
    const [open, setOpen] = React.useState(false)
    const [viewYear, setViewYear] = React.useState(() => {
        const now = new Date()
        return now.getFullYear()
    })
    const [selecting, setSelecting] = React.useState<"start" | "end">("start")

    const displayValue = startMonth && endMonth
        ? `${startMonth} ~ ${endMonth}`
        : startMonth
            ? `${startMonth} ~ ?`
            : endMonth
                ? `? ~ ${endMonth}`
                : "选择月份范围"

    const handleMonthClick = (monthIndex: number) => {
        const monthValue = `${viewYear}-${String(monthIndex + 1).padStart(2, "0")}`

        if (selecting === "start") {
            onStartMonthChange(monthValue)
            setSelecting("end")
        } else {
            // 如果选择的结束月份早于开始月份，自动调整
            if (monthValue < startMonth) {
                onEndMonthChange(startMonth)
                onStartMonthChange(monthValue)
            } else {
                onEndMonthChange(monthValue)
            }
            setSelecting("start")
            setOpen(false)
        }
    }

    const isSelected = (monthIndex: number) => {
        const monthValue = `${viewYear}-${String(monthIndex + 1).padStart(2, "0")}`
        if (startMonth && monthValue === startMonth) return "start"
        if (endMonth && monthValue === endMonth) return "end"
        if (startMonth && endMonth && monthValue > startMonth && monthValue < endMonth) return "in-range"
        return "none"
    }

    const prevYear = () => setViewYear(y => y - 1)
    const nextYear = () => setViewYear(y => y + 1)

    return (
        <Popover open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (isOpen) {
                // 如果已有开始月份，用它初始化视图年份
                if (startMonth) {
                    setViewYear(parseInt(startMonth.split("-")[0]))
                }
                setSelecting("start")
            }
        }}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !startMonth && !endMonth && "text-muted-foreground",
                        className
                    )}
                >
                    <Calendar className="mr-2 h-4 w-4" />
                    {displayValue}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevYear}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium">{viewYear}年</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextYear}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                        {MONTHS.map((month, index) => {
                            const status = isSelected(index)
                            return (
                                <button
                                    key={month}
                                    onClick={() => handleMonthClick(index)}
                                    className={cn(
                                        "h-8 rounded text-xs transition-colors",
                                        status === "start" && "bg-primary text-primary-foreground hover:bg-primary/90",
                                        status === "end" && "bg-primary text-primary-foreground hover:bg-primary/90",
                                        status === "in-range" && "bg-primary/20",
                                        status === "none" && "hover:bg-accent"
                                    )}
                                >
                                    {month}
                                </button>
                            )
                        })}
                    </div>
                    <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                        <span>{selecting === "start" ? "请选择开始月份" : "请选择结束月份"}</span>
                        {(startMonth || endMonth) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => {
                                    onStartMonthChange("")
                                    onEndMonthChange("")
                                }}
                            >
                                清除
                            </Button>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
