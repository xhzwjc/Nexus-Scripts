import React, {useEffect, useRef} from 'react';

// ================= 定义类型接口 =================
// 放在组件外面，或者单独的文件里，这样 TypeScript 就能识别了
// interface PointProps {
//     x: number;
//     y: number;
//     fixed: boolean;
// }

export const ClothBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        // ================= 参数设置 =================
        const gridSizeX = 40; // 横向点数
        const gridSizeY = 25; // 纵向点数
        const stiffness = 0.15; // 增加一点刚性
        const damping = 0.96; // 阻尼
        const windForce = 0.08;
        const tearThreshold = 50;// 更难撕裂，防止误触
        const interactionRadius = 120;
        const gravity = 0.15;

        // ================= 类定义 (包含完整的 TS 类型) =================
        class Point {
            // 在这里显式声明属性类型，否则 TS 会报错
            x: number;
            y: number;
            oldX: number;
            oldY: number;
            fixed: boolean;
            originalX: number;

            constructor(x: number, y: number, fixed = false) {
                this.x = x;
                this.y = y;
                this.oldX = x;
                this.oldY = y;
                this.fixed = fixed;
                this.originalX = x;
            }

            update() {
                if (this.fixed) return;
                const vx = (this.x - this.oldX) * damping;
                const vy = (this.y - this.oldY) * damping;
                this.oldX = this.x;
                this.oldY = this.y;
                this.x += vx;
                this.y += vy + gravity;
            }

            constrain() {
                if (this.x < -100) this.x = -100;
                if (this.x > width + 100) this.x = width + 100;
                if (this.y > height + 100) this.y = height + 100;
            }
        }

        class Spring {
            // ✅ 显式声明属性类型
            p1: Point;
            p2: Point;
            restLength: number;
            broken: boolean;

            constructor(p1: Point, p2: Point) {
                this.p1 = p1;
                this.p2 = p2;
                this.restLength = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                this.broken = false;
            }

            update() {
                if (this.broken) return;
                const dx = this.p2.x - this.p1.x;
                const dy = this.p2.y - this.p1.y;
                const dist = Math.hypot(dx, dy);

                if (dist === 0) return;

                const force = (dist - this.restLength) * stiffness;
                // ✅ 显式定义局部变量类型 (虽然 TS 通常能推断，但写出来更稳)
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                const mass = 1; // 假设质量为1

                if (!this.p1.fixed) {
                    this.p1.x += fx / mass;
                    this.p1.y += fy / mass;
                }
                if (!this.p2.fixed) {
                    this.p2.x -= fx / mass;
                    this.p2.y -= fy / mass;
                }
            }
        }

        // ================= 数据初始化 =================
        // ✅ 关键修复：显式告诉 TS 这两个数组里装的是什么
        let points: Point[] = [];
        let springs: Spring[] = [];

        function init() {
            points = [];
            springs = [];

            // 1. 创建网格点
            for (let y = 0; y < gridSizeY; y++) {
                for (let x = 0; x <= gridSizeX; x++) {
                    const px = (x * width) / gridSizeX;
                    const py = y * 30;
                    const fixed = y === 0;
                    points.push(new Point(px, py, fixed));
                }
            }

            // 2. 创建弹簧
            for (let y = 0; y < gridSizeY; y++) {
                for (let x = 0; x <= gridSizeX; x++) {
                    const idx = y * (gridSizeX + 1) + x;
                    if (x < gridSizeX) {
                        // 确保点存在再创建弹簧
                        if (points[idx] && points[idx + 1]) {
                            springs.push(new Spring(points[idx], points[idx + 1]));
                        }
                    }
                    if (y < gridSizeY - 1) {
                        const belowIdx = idx + gridSizeX + 1;
                        if (points[idx] && points[belowIdx]) {
                            springs.push(new Spring(points[idx], points[belowIdx]));
                        }
                    }
                }
            }

            // 3. 扰动 (窗帘下落效果)
            points.forEach(p => {
                if (!p.fixed) {
                    p.y = -Math.random() * 100 - 50;
                    p.oldY = p.y;
                    p.x += (Math.random() - 0.5) * 50;
                    p.oldX = p.x;
                }
            });
        }

        // ================= 交互逻辑 =================
        let mouseX = 0;
        let mouseY = 0;
        let prevMouseX = 0;
        let prevMouseY = 0;
        let mouseDown = false;
        let time = 0;
        let animationFrameId: number;

        const handleMouseMove = (e: MouseEvent) => {
            prevMouseX = mouseX;
            prevMouseY = mouseY;
            mouseX = e.clientX;
            mouseY = e.clientY;
        };
        const handleMouseDown = () => {
            mouseDown = true;
        };
        const handleMouseUp = () => {
            mouseDown = false;
        };

        // ================= 动画循环 =================
        function update() {
            time += 0.01;

            points.forEach(p => {
                p.update();
                p.constrain();
            });

            for (let i = 0; i < 3; i++) springs.forEach(s => s.update());

            const mouseVX = mouseX - prevMouseX;
            const mouseVY = mouseY - prevMouseY;
            const mouseSpeed = Math.hypot(mouseVX, mouseVY);

            points.forEach(p => {
                if (p.fixed) return;

                // 鼠标交互
                const dx = mouseX - p.x;
                const dy = mouseY - p.y;
                const dist = Math.hypot(dx, dy);

                if (dist < interactionRadius) {
                    const influence = (1 - dist / interactionRadius) * windForce;
                    p.x += mouseVX * influence;
                    p.y += mouseVY * influence;
                }

                // 风场效果
                const windStrength = 0.02;
                const yRatio = p.y / height;
                const wave = Math.sin(time + p.originalX * 0.01 + p.y * 0.01);
                p.x += wave * windStrength * yRatio;
            });

            if (mouseDown && mouseSpeed > tearThreshold) {
                springs.forEach(s => {
                    if (s.broken) return;
                    const midX = (s.p1.x + s.p2.x) / 2;
                    const midY = (s.p1.y + s.p2.y) / 2;
                    const dist = Math.hypot(mouseX - midX, mouseY - midY);
                    if (dist < 30) s.broken = true;
                });
            }
        }

        function draw() {
            if (!ctx) return;
            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            springs.forEach(s => {
                if (!s.broken) {
                    ctx.moveTo(s.p1.x, s.p1.y);
                    ctx.lineTo(s.p2.x, s.p2.y);
                }
            });
            ctx.stroke();
        }

        function loop() {
            update();
            draw();
            animationFrameId = requestAnimationFrame(loop);
        }

        // ================= 启动与清理 =================
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        init();
        loop();

        const handleResize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            init();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full pointer-events-auto z-0"
            style={{background: 'linear-gradient(135deg, #f8fafb 0%, #f1f5f9 100%)'}}
        />
    );
};