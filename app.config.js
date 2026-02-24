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
    version: "1.1.2",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "electronscout",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icons/splash-icon-light.png",
      resizeMode: "contain",
      backgroundColor: "#1a1a1a",
      dark: {
        image: "./assets/splash-icons/splash-icon-light.png",
        backgroundColor: "#1a1a1a"
      }
    },
    ios: {
      bundleIdentifier: "com.valencerobotics.electronscout",
      supportsTablet: true,
      infoPlist: {
        LSApplicationQueriesSchemes: ["itms-apps"],
      },
      "icon": {
        "dark": "./assets/ios-icons/ios-dark.png",
        "light": "./assets/ios-icons/ios-light.png",
        "tinted": "./assets/ios-icons/ios-tinted.png"
      }
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
    plugins: [
      "expo-router",
      "expo-sqlite"
    ],
    experiments: {
      typedRoutes: true
    },
    updates: {
      url: "https://u.expo.dev/753b98be-adbc-44ff-ad33-8da220a6b540"
    },
    runtimeVersion: {
      policy: "appVersion"
    }
  }
};

