'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

type AnimatedLoginCharactersProps = {
    isTyping: boolean;
    keyLength: number;
    isKeyVisible: boolean;
};

type PupilProps = {
    mouseX: number;
    mouseY: number;
    size?: number;
    maxDistance?: number;
    pupilColor?: string;
    forceLookX?: number;
    forceLookY?: number;
};

function Pupil({
    mouseX,
    mouseY,
    size = 12,
    maxDistance = 5,
    pupilColor = '#2D2D2D',
    forceLookX,
    forceLookY,
}: PupilProps) {
    const pupilRef = useRef<HTMLDivElement>(null);

    const getPosition = () => {
        if (!pupilRef.current) return { x: 0, y: 0 };
        if (forceLookX !== undefined && forceLookY !== undefined) {
            return { x: forceLookX, y: forceLookY };
        }

        const rect = pupilRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = mouseX - centerX;
        const deltaY = mouseY - centerY;
        const distance = Math.min(Math.hypot(deltaX, deltaY), maxDistance);
        const angle = Math.atan2(deltaY, deltaX);

        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance,
        };
    };

    const position = getPosition();

    return (
        <div
            ref={pupilRef}
            className="rounded-full"
            style={{
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: pupilColor,
                transform: `translate(${position.x}px, ${position.y}px)`,
                transition: 'transform 0.1s ease-out',
            }}
        />
    );
}

type EyeBallProps = {
    mouseX: number;
    mouseY: number;
    size?: number;
    pupilSize?: number;
    maxDistance?: number;
    eyeColor?: string;
    pupilColor?: string;
    isBlinking?: boolean;
    forceLookX?: number;
    forceLookY?: number;
};

function EyeBall({
    mouseX,
    mouseY,
    size = 18,
    pupilSize = 7,
    maxDistance = 5,
    eyeColor = 'white',
    pupilColor = '#2D2D2D',
    isBlinking = false,
    forceLookX,
    forceLookY,
}: EyeBallProps) {
    const eyeRef = useRef<HTMLDivElement>(null);

    const getPosition = () => {
        if (!eyeRef.current) return { x: 0, y: 0 };
        if (forceLookX !== undefined && forceLookY !== undefined) {
            return { x: forceLookX, y: forceLookY };
        }

        const rect = eyeRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = mouseX - centerX;
        const deltaY = mouseY - centerY;
        const distance = Math.min(Math.hypot(deltaX, deltaY), maxDistance);
        const angle = Math.atan2(deltaY, deltaX);

        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance,
        };
    };

    const position = getPosition();

    return (
        <div
            ref={eyeRef}
            className="rounded-full flex items-center justify-center transition-all duration-150"
            style={{
                width: `${size}px`,
                height: isBlinking ? '2px' : `${size}px`,
                backgroundColor: eyeColor,
                overflow: 'hidden',
            }}
        >
            {!isBlinking && (
                <div
                    className="rounded-full"
                    style={{
                        width: `${pupilSize}px`,
                        height: `${pupilSize}px`,
                        backgroundColor: pupilColor,
                        transform: `translate(${position.x}px, ${position.y}px)`,
                        transition: 'transform 0.1s ease-out',
                    }}
                />
            )}
        </div>
    );
}

function useBlink(setBlinking: (value: boolean) => void) {
    useEffect(() => {
        let blinkTimer: number | undefined;
        let resetTimer: number | undefined;
        let disposed = false;

        const scheduleBlink = () => {
            blinkTimer = window.setTimeout(() => {
                if (disposed) return;
                setBlinking(true);
                resetTimer = window.setTimeout(() => {
                    if (disposed) return;
                    setBlinking(false);
                    scheduleBlink();
                }, 150);
            }, Math.random() * 4000 + 3000);
        };

        scheduleBlink();
        return () => {
            disposed = true;
            if (blinkTimer) window.clearTimeout(blinkTimer);
            if (resetTimer) window.clearTimeout(resetTimer);
        };
    }, [setBlinking]);
}

export function AnimatedLoginCharacters({ isTyping, keyLength, isKeyVisible }: AnimatedLoginCharactersProps) {
    const [mouseX, setMouseX] = useState(0);
    const [mouseY, setMouseY] = useState(0);
    const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
    const [isBlackBlinking, setIsBlackBlinking] = useState(false);
    const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
    const [isPurplePeeking, setIsPurplePeeking] = useState(false);

    const purpleRef = useRef<HTMLDivElement>(null);
    const blackRef = useRef<HTMLDivElement>(null);
    const yellowRef = useRef<HTMLDivElement>(null);
    const orangeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            setMouseX(event.clientX);
            setMouseY(event.clientY);
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useBlink(setIsPurpleBlinking);
    useBlink(setIsBlackBlinking);

    useEffect(() => {
        if (!isTyping) {
            setIsLookingAtEachOther(false);
            return;
        }

        setIsLookingAtEachOther(true);
        const timer = window.setTimeout(() => setIsLookingAtEachOther(false), 800);
        return () => window.clearTimeout(timer);
    }, [isTyping]);

    useEffect(() => {
        if (!(keyLength > 0 && isKeyVisible)) {
            setIsPurplePeeking(false);
            return;
        }

        let peekTimer: number | undefined;
        let resetTimer: number | undefined;
        let disposed = false;

        const schedulePeek = () => {
            peekTimer = window.setTimeout(() => {
                if (disposed) return;
                setIsPurplePeeking(true);
                resetTimer = window.setTimeout(() => {
                    if (disposed) return;
                    setIsPurplePeeking(false);
                    schedulePeek();
                }, 800);
            }, Math.random() * 3000 + 2000);
        };

        schedulePeek();
        return () => {
            disposed = true;
            if (peekTimer) window.clearTimeout(peekTimer);
            if (resetTimer) window.clearTimeout(resetTimer);
        };
    }, [keyLength, isKeyVisible]);

    const getCharacterPosition = (ref: RefObject<HTMLDivElement | null>) => {
        if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };

        const rect = ref.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 3;
        const deltaX = mouseX - centerX;
        const deltaY = mouseY - centerY;

        return {
            faceX: Math.max(-15, Math.min(15, deltaX / 20)),
            faceY: Math.max(-10, Math.min(10, deltaY / 30)),
            bodySkew: Math.max(-6, Math.min(6, -deltaX / 120)),
        };
    };

    const purplePos = getCharacterPosition(purpleRef);
    const blackPos = getCharacterPosition(blackRef);
    const yellowPos = getCharacterPosition(yellowRef);
    const orangePos = getCharacterPosition(orangeRef);
    const isCoveringKey = keyLength > 0 && isKeyVisible;
    const isLeaning = isTyping || (keyLength > 0 && !isKeyVisible);

    return (
        <div className="relative hidden lg:flex flex-col overflow-hidden border-r border-border/40 p-12 text-slate-900 dark:text-slate-100 bg-[radial-gradient(120%_120%_at_0%_0%,#e8f7ff_0%,#dff5f2_42%,#f4fbff_100%)] dark:bg-[radial-gradient(120%_120%_at_0%_0%,#0f172a_0%,#0b2530_42%,#102a43_100%)]">
            <div className="relative z-20 flex items-center gap-3 text-lg font-semibold tracking-wide">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-900/10 dark:bg-white/15 backdrop-blur-sm">
                    <Sparkles className="size-4" />
                </div>
                <div className="mt-1">ScriptHub</div>
            </div>

            <div className="relative z-20 flex flex-1 items-center justify-center">
                <div className="relative" style={{ width: '550px', height: '400px' }}>
                    <div
                        ref={purpleRef}
                        className="absolute bottom-0 transition-all duration-700 ease-in-out"
                        style={{
                            left: '70px',
                            width: '180px',
                            height: isLeaning ? '440px' : '400px',
                            backgroundColor: '#6C3FF5',
                            borderRadius: '10px 10px 0 0',
                            zIndex: 1,
                            transform: isCoveringKey
                                ? 'skewX(0deg)'
                                : isLeaning
                                    ? `skewX(${purplePos.bodySkew - 12}deg) translateX(40px)`
                                    : `skewX(${purplePos.bodySkew}deg)`,
                            transformOrigin: 'bottom center',
                        }}
                    >
                        <div
                            className="absolute flex gap-8 transition-all duration-700 ease-in-out"
                            style={{
                                left: isCoveringKey ? '20px' : isLookingAtEachOther ? '55px' : `${45 + purplePos.faceX}px`,
                                top: isCoveringKey ? '35px' : isLookingAtEachOther ? '65px' : `${40 + purplePos.faceY}px`,
                            }}
                        >
                            <EyeBall
                                mouseX={mouseX}
                                mouseY={mouseY}
                                isBlinking={isPurpleBlinking}
                                forceLookX={isCoveringKey ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
                                forceLookY={isCoveringKey ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
                            />
                            <EyeBall
                                mouseX={mouseX}
                                mouseY={mouseY}
                                isBlinking={isPurpleBlinking}
                                forceLookX={isCoveringKey ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
                                forceLookY={isCoveringKey ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
                            />
                        </div>
                    </div>

                    <div
                        ref={blackRef}
                        className="absolute bottom-0 transition-all duration-700 ease-in-out"
                        style={{
                            left: '240px',
                            width: '120px',
                            height: '310px',
                            backgroundColor: '#2D2D2D',
                            borderRadius: '8px 8px 0 0',
                            zIndex: 2,
                            transform: isCoveringKey
                                ? 'skewX(0deg)'
                                : isLookingAtEachOther
                                    ? `skewX(${blackPos.bodySkew * 1.5 + 10}deg) translateX(20px)`
                                    : isLeaning
                                        ? `skewX(${blackPos.bodySkew * 1.5}deg)`
                                        : `skewX(${blackPos.bodySkew}deg)`,
                            transformOrigin: 'bottom center',
                        }}
                    >
                        <div
                            className="absolute flex gap-6 transition-all duration-700 ease-in-out"
                            style={{
                                left: isCoveringKey ? '10px' : isLookingAtEachOther ? '32px' : `${26 + blackPos.faceX}px`,
                                top: isCoveringKey ? '28px' : isLookingAtEachOther ? '12px' : `${32 + blackPos.faceY}px`,
                            }}
                        >
                            <EyeBall
                                mouseX={mouseX}
                                mouseY={mouseY}
                                size={16}
                                pupilSize={6}
                                maxDistance={4}
                                isBlinking={isBlackBlinking}
                                forceLookX={isCoveringKey ? -4 : isLookingAtEachOther ? 0 : undefined}
                                forceLookY={isCoveringKey ? -4 : isLookingAtEachOther ? -4 : undefined}
                            />
                            <EyeBall
                                mouseX={mouseX}
                                mouseY={mouseY}
                                size={16}
                                pupilSize={6}
                                maxDistance={4}
                                isBlinking={isBlackBlinking}
                                forceLookX={isCoveringKey ? -4 : isLookingAtEachOther ? 0 : undefined}
                                forceLookY={isCoveringKey ? -4 : isLookingAtEachOther ? -4 : undefined}
                            />
                        </div>
                    </div>

                    <div
                        ref={orangeRef}
                        className="absolute bottom-0 transition-all duration-700 ease-in-out"
                        style={{
                            left: '0px',
                            width: '240px',
                            height: '200px',
                            backgroundColor: '#FF9B6B',
                            borderRadius: '120px 120px 0 0',
                            zIndex: 3,
                            transform: isCoveringKey ? 'skewX(0deg)' : `skewX(${orangePos.bodySkew}deg)`,
                            transformOrigin: 'bottom center',
                        }}
                    >
                        <div
                            className="absolute flex gap-8 transition-all duration-200 ease-out"
                            style={{
                                left: isCoveringKey ? '50px' : `${82 + orangePos.faceX}px`,
                                top: isCoveringKey ? '85px' : `${90 + orangePos.faceY}px`,
                            }}
                        >
                            <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isCoveringKey ? -5 : undefined} forceLookY={isCoveringKey ? -4 : undefined} />
                            <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isCoveringKey ? -5 : undefined} forceLookY={isCoveringKey ? -4 : undefined} />
                        </div>
                    </div>

                    <div
                        ref={yellowRef}
                        className="absolute bottom-0 transition-all duration-700 ease-in-out"
                        style={{
                            left: '310px',
                            width: '140px',
                            height: '230px',
                            backgroundColor: '#E8D754',
                            borderRadius: '70px 70px 0 0',
                            zIndex: 4,
                            transform: isCoveringKey ? 'skewX(0deg)' : `skewX(${yellowPos.bodySkew}deg)`,
                            transformOrigin: 'bottom center',
                        }}
                    >
                        <div
                            className="absolute flex gap-6 transition-all duration-200 ease-out"
                            style={{
                                left: isCoveringKey ? '20px' : `${52 + yellowPos.faceX}px`,
                                top: isCoveringKey ? '35px' : `${40 + yellowPos.faceY}px`,
                            }}
                        >
                            <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isCoveringKey ? -5 : undefined} forceLookY={isCoveringKey ? -4 : undefined} />
                            <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isCoveringKey ? -5 : undefined} forceLookY={isCoveringKey ? -4 : undefined} />
                        </div>
                        <div
                            className="absolute h-[4px] w-20 rounded-full bg-[#2D2D2D] transition-all duration-200 ease-out"
                            style={{
                                left: isCoveringKey ? '10px' : `${40 + yellowPos.faceX}px`,
                                top: isCoveringKey ? '88px' : `${88 + yellowPos.faceY}px`,
                            }}
                        />
                    </div>
                </div>
            </div>


            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(226,232,240,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(226,232,240,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="pointer-events-none absolute right-1/4 top-1/4 size-64 rounded-full bg-cyan-300/35 dark:bg-cyan-500/25 blur-3xl" />
            <div className="pointer-events-none absolute bottom-1/4 left-1/4 size-96 rounded-full bg-emerald-300/30 dark:bg-emerald-500/20 blur-3xl" />
        </div>
    );
}


