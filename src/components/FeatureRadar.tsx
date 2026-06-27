import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';
import type { AudioFeatures } from '../api/client';

interface Props {
  features: AudioFeatures;
}

export function FeatureRadar({ features }: Props) {
  const data = [
    { subject: 'Valence', value: Math.round(features.valence * 100) },
    { subject: 'Energy', value: Math.round(features.energy * 100) },
    { subject: 'Dance', value: Math.round(features.danceability * 100) },
    { subject: 'Acoustic', value: Math.round(features.acousticness * 100) },
    { subject: 'Instrum.', value: Math.round(features.instrumentalness * 100) },
    { subject: 'Liveness', value: Math.round(features.liveness * 100) },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#fecdd3" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#9f6b5c' }} />
        <Radar
          name="features"
          dataKey="value"
          stroke="#f43f5e"
          fill="#f43f5e"
          fillOpacity={0.2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
