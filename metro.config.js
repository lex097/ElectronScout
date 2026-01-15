// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Handle expo-sqlite web platform issue
config.resolver = {
  ...config.resolver,
  assetExts: [...(config.resolver?.assetExts || []), 'wasm'],
  sourceExts: [...(config.resolver?.sourceExts || []), 'wasm'],
  resolveRequest: (context, moduleName, platform) => {
    // For web platform, provide a mock for expo-sqlite
    if (platform === 'web' && moduleName.includes('expo-sqlite')) {
      return {
        type: 'empty',
      };
    }
    // Default resolution
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
