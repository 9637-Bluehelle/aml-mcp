import { getScoreClass, getClassColor } from '../lib/aml-data';

interface RiskBadgeProps {
  score: number;
  label?: string;
}

export function RiskBadge({ score, label }: RiskBadgeProps) {
  const scoreClass = getScoreClass(score);
  const colorClass = getClassColor(scoreClass.grade);

  return (
    <div className="inline-flex items-center gap-2">
      {label && <span className="text-sm font-medium text-gray-700">{label}:</span>}
      <div className={`px-3 py-1 rounded-full text-sm font-semibold ${colorClass}`}>
        {score.toFixed(2)} - {scoreClass.label}
      </div>
    </div>
  );
}
