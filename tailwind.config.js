/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './app.js', './core.js'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif']
            }
        }
    },
    plugins: []
};
