/**
 * Três requisitos convivem aqui — a ordem e as flags NÃO são acidentais:
 *
 *  1. **VisionCamera** (T070, FR-021): os frame processors são worklets. Sem o plugin do
 *     `react-native-worklets-core` eles compilam como funções JS comuns e a captura na thread da
 *     câmera nunca roda.
 *
 *  2. **NativeWind** (design system): precisa do `jsxImportSource: "nativewind"` para transformar as
 *     classes Tailwind. NÃO adicionar o preset `nativewind/babel`: ele injeta
 *     `react-native-worklets/plugin` (do reanimated 4, que não usamos) e o bundle morre com
 *     "Cannot find module 'react-native-worklets/plugin'".
 *
 *  3. **`reanimated: false`**: o `react-native-reanimated` está instalado só porque o css-interop do
 *     NativeWind faz `require('react-native-reanimated')` (lazy, para animações) e o Metro resolve
 *     esses requires estaticamente. **O app não usa reanimated diretamente.** Deixar o preset ligar o
 *     plugin dele faz dois transformadores de worklet disputarem os mesmos arquivos, e o do
 *     reanimated estoura nos frame processors do VisionCamera:
 *     "[Reanimated] Babel plugin exception: Cannot read properties of undefined (reading 'length')".
 *     Desligado, o worklets-core cuida dos worklets e o reanimated segue resolvível para o Metro.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind', reanimated: false }]],
    plugins: ['react-native-worklets-core/plugin'],
  };
};
