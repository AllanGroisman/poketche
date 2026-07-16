/**
 * O projeto rodava sem babel.config.js (o Expo aplica o `babel-preset-expo` por padrão). Ele
 * passa a existir por causa de um requisito só: os **frame processors** do VisionCamera (T070,
 * FR-021) são funções worklet, e sem o plugin do `react-native-worklets-core` elas são compiladas
 * como funções JS comuns — o processador nunca roda na thread da câmera e a detecção de retângulo
 * em tempo real simplesmente não acontece.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets-core/plugin'],
  };
};
