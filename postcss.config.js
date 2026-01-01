module.exports = {
  plugins: {
    'postcss-import': {},  // Must be first to process @import statements
    tailwindcss: {},
    autoprefixer: {},
  },
}
