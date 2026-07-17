/**
 * Metro config só para plugar o NativeWind (transforma as classes Tailwind do design system).
 * Mantém os defaults do Expo (que já resolviam o monorepo pnpm sem config explícita).
 */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './globals.css' });
