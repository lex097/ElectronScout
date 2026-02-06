module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Remove console logs in production (keep console.error and console.warn)
      ['transform-remove-console', {
        exclude: ['error', 'warn'] // Keep errors and warnings for debugging
      }]
    ],
  };
};
