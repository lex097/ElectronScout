export default {
  expo: {
    owner: "aadi-ds-organization",
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      // TBA API Key: Get your free API key from https://www.thebluealliance.com/account
      tbaApiKey: process.env.EXPO_PUBLIC_TBA_API_KEY,
      eas: {
        projectId: "753b98be-adbc-44ff-ad33-8da220a6b540"
      }
    },
    name: "ElectronScout",
    slug: "electronscout",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "electronscout",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      bundleIdentifier: "com.valencerobotics.electronscout",
      supportsTablet: true
    },
    android: {
      package: "com.valencerobotics.electronscout",
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-sqlite"
    ],
    experiments: {
      typedRoutes: true
    }
  }
};

