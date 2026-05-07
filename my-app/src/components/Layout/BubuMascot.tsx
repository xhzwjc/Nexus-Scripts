import React, { useEffect, useState } from 'react';

export const BubuMascot: React.FC = () => {
    // 显式定义常量类型，虽然 TS 能推断，但写出来更规范
    const CYCLE_DURATION: number = 50;

    const [animationDelay, setAnimationDelay] = useState<number>(0);

    useEffect(() => {
        // 1. 安全检查：确保在浏览器环境中执行 (防止服务端渲染报错)
        if (typeof window === 'undefined') return;

        // 2. 显式定义类型 string | null
        const startTimeStr: string | null = sessionStorage.getItem('bubu_animation_start_time');
        let startTime: number;

        if (!startTimeStr) {
            startTime = Date.now();
            sessionStorage.setItem('bubu_animation_start_time', startTime.toString());
        } else {
            // 3. 显式转为数字，parseInt 第二个参数 10 也是个好习惯
            startTime = parseInt(startTimeStr, 10);
        }

        const now: number = Date.now();
        const elapsedSeconds: number = (now - startTime) / 1000;
        const currentCycleTime: number = elapsedSeconds % CYCLE_DURATION;

        setAnimationDelay(-currentCycleTime);
    }, [CYCLE_DURATION]);

    return (
        <>
            <style>
                {`
          /* ================= 核心路径动画 ================= */
          @keyframes patrol-cycle {
            /* 0%: 在左下角地下 */
            0% { transform: translateX(0px) translateY(150%); }
            
            /* 1%: 钻出来 */
            1% { transform: translateX(0px) translateY(0); }
            
            /* 88%: 走到最右侧 */
            88% { transform: translateX(calc(100vw - 50px)) translateY(0); }
            
            /* 89%: 钻入地下 */
            89% { transform: translateX(calc(100vw - 50px)) translateY(150%); }
            
            /* 89% -> 100%: 地下休息 */
            100% { transform: translateX(calc(100vw - 50px)) translateY(150%); }
          }
          
          @keyframes run-bounce {
            0%, 100% { margin-bottom: 0px; transform: rotate(0deg); }
            50% { margin-bottom: 5px; transform: rotate(2deg); }
          }
          
          @keyframes blink {
            0%, 48%, 52%, 100% { transform: scaleY(1); }
            50% { transform: scaleY(0.1); }
          }

          @keyframes leg-move {
             from { transform: translateY(0); }
             to { transform: translateY(-5px); }
          }

          /* ================= 容器布局 ================= */
          .bubu-track-mover {
            position: fixed;
            bottom: 0;
            left: 0;
            z-index: 2000;
            pointer-events: none;
            will-change: transform;
            
            animation-name: patrol-cycle;
            animation-duration: ${CYCLE_DURATION}s; 
            animation-timing-function: linear;
            animation-iteration-count: infinite;
          }

          .bubu-scale-wrapper {
            transform: scale(0.15); 
            transform-origin: bottom left;
            margin-left: 10px;
          }

          .bubu-bouncer {
            display: flex;
            align-items: flex-end;
            animation: run-bounce 0.5s ease-in-out infinite;
            filter: drop-shadow(0 10px 10px rgba(0,0,0,0.1));
          }

          /* ================= 角色样式 ================= */
          .yibu-wrapper { position: relative; z-index: 2; }
          .yibu-head {
            width: 130px; height: 100px; background: #ffffff;
            border-radius: 65px 65px 40px 40px; position: relative;
            box-shadow: inset -5px -5px 15px rgba(0,0,0,0.02); border: 2px solid #e2e8f0;
          }
          .yibu-ear {
            width: 30px; height: 30px; background: #ffffff;
            border-radius: 50%; position: absolute; top: 0; z-index: -1; border: 2px solid #e2e8f0;
          }
          .yibu-ear.left { left: 8px; } .yibu-ear.right { right: 8px; }
          .yibu-face {
            position: absolute; top: 40px; left: 50%; transform: translateX(-50%); width: 80px;
          }
          .yibu-eye {
            width: 9px; height: 9px; background: #2d3436; border-radius: 50%;
            position: absolute; top: 0; animation: blink 4s infinite;
          }
          .yibu-eye.left { left: 12px; } .yibu-eye.right { right: 12px; }
          .yibu-nose {
            width: 12px; height: 9px; background: #2d3436; border-radius: 40%;
            position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
          }
          .yibu-blush {
            width: 20px; height: 12px; background: #ffb7b2; border-radius: 50%;
            position: absolute; top: 15px; opacity: 0.6;
          }
          .yibu-blush.left { left: -8px; } .yibu-blush.right { right: -8px; }
          .holding-hand {
            width: 20px; height: 15px; background: #fff; position: absolute;
            bottom: 20px; left: -10px; z-index: 10; border-radius: 10px;
          }

          .erbu-wrapper { position: relative; margin-right: -25px; z-index: 1; }
          .erbu-head {
            width: 85px; height: 75px; background: #ffffff;
            border-radius: 42px 42px 30px 30px; position: relative; border: 2px solid #e2e8f0;
          }
          .erbu-ear {
            width: 22px; height: 22px; background: #333333; border-radius: 50%;
            position: absolute; top: -2px; z-index: -1;
          }
          .erbu-ear.left { left: 4px; } .erbu-ear.right { right: 4px; }
          .erbu-face {
            position: absolute; top: 30px; left: 50%; transform: translateX(-50%); width: 50px;
          }
          .erbu-eye-patch {
            width: 16px; height: 12px; background: #333333; border-radius: 50% 50% 40% 40%;
            position: absolute; top: 0; transform: rotate(-15deg);
          }
          .erbu-eye-patch.right { right: 0; transform: rotate(15deg); } .erbu-eye-patch.left { left: 0; }
          .erbu-eye-white {
            width: 3px; height: 3px; background: #fff; border-radius: 50%;
            position: absolute; top: 3px; left: 4px; animation: blink 4s infinite 0.2s;
          }
          .erbu-nose {
            width: 7px; height: 5px; background: #333333; border-radius: 50%;
            position: absolute; top: 9px; left: 50%; transform: translateX(-50%);
          }
          .leg {
            width: 14px; height: 12px; background: #e2e8f0; position: absolute;
            bottom: -6px; border-radius: 0 0 50% 50%;
          }
          .leg.l { left: 25%; animation: leg-move 0.4s infinite alternate; }
          .leg.r { right: 25%; animation: leg-move 0.4s infinite alternate-reverse; }
        `}
            </style>

            <div
                className="bubu-track-mover"
                style={{ animationDelay: `${animationDelay}s` }}
            >
                <div className="bubu-scale-wrapper">
                    <div className="bubu-bouncer">
                        <div className="erbu-wrapper">
                            <div className="erbu-ear left"></div>
                            <div className="erbu-ear right"></div>
                            <div className="erbu-head">
                                <div className="erbu-face">
                                    <div className="erbu-eye-patch left">
                                        <div className="erbu-eye-white"></div>
                                    </div>
                                    <div className="erbu-eye-patch right">
                                        <div className="erbu-eye-white"></div>
                                    </div>
                                    <div className="erbu-nose"></div>
                                </div>
                                <div className="leg l" style={{ background: '#333' }}></div>
                                <div className="leg r" style={{ background: '#333' }}></div>
                            </div>
                        </div>

                        <div className="yibu-wrapper">
                            <div className="yibu-ear left"></div>
                            <div className="yibu-ear right"></div>
                            <div className="yibu-head">
                                <div className="yibu-face">
                                    <div className="yibu-blush left"></div>
                                    <div className="yibu-blush right"></div>
                                    <div className="yibu-eye left"></div>
                                    <div className="yibu-eye right"></div>
                                    <div className="yibu-nose"></div>
                                </div>
                                <div className="holding-hand"></div>
                                <div className="leg l"></div>
                                <div className="leg r"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};