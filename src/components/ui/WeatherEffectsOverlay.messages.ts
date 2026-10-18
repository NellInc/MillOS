import { defineMessages } from '../../i18n';

type WeatherType = 'storm' | 'rain' | 'wind' | 'snow' | 'clear';
type WeatherSeverity = 'low' | 'medium' | 'high';

const PT_WARNINGS: Record<WeatherType, string> = {
  storm: 'Alerta de tempestade',
  rain: 'Alerta de chuva',
  wind: 'Alerta de vento',
  snow: 'Alerta de neve',
  clear: 'Alerta climático',
};

const PT_SEVERITIES: Record<WeatherSeverity, string> = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
};

/** English shows the raw enum values, as before; pt-BR names them. */
export const weatherEffectsOverlayMessages = defineMessages({
  en: {
    warning: (p: { type: WeatherType }) => `${p.type} Warning`,
    severity: (p: { severity: WeatherSeverity }) => `Severity: ${p.severity}`,
  },
  'pt-BR': {
    warning: (p: { type: WeatherType }) => PT_WARNINGS[p.type] ?? `Alerta: ${p.type}`,
    severity: (p: { severity: WeatherSeverity }) =>
      `Gravidade: ${PT_SEVERITIES[p.severity] ?? p.severity}`,
  },
});
