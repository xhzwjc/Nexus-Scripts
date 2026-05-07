// tailwind.config.js
module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx}", // 如果你用的是 src 目录
    ],
    safelist: [
        'bg-blue-50', 'text-blue-600',
        'bg-green-50', 'text-green-600',
        'bg-purple-50', 'text-purple-600',
        'bg-amber-50', 'text-amber-600',
        'bg-indigo-50', 'text-indigo-600',
        'bg-rose-50', 'text-rose-600',
        'bg-teal-50', 'text-teal-600',
        'bg-red-50', 'text-red-600',
    ],
    theme: {
        extend: {},
    },
    plugins: [],
}
