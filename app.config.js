// Layers the auth-related native config on top of app.json so the Google
// reversed-client-id can come from .env instead of being committed.
module.exports = ({ config }) => {
  config.ios = { ...(config.ios || {}), usesAppleSignIn: true };

  const plugins = (config.plugins || []).filter(
    (p) => (Array.isArray(p) ? p[0] : p) !== '@react-native-google-signin/google-signin'
  );
  plugins.push('expo-apple-authentication');
  plugins.push([
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || 'com.googleusercontent.apps.REPLACE_ME' },
  ]);
  config.plugins = plugins;

  return config;
};
