import type { FactCheckReport } from '../types';

interface ResultCardProps {
  report: FactCheckReport;
}

const getVerdictColor = (verdict: string) => {
  const verdictMap: Record<string, string> = {
    TRUE: 'badge-true',
    MOSTLY_TRUE: 'badge-true',
    MISLEADING: 'badge-misleading',
    FALSE: 'badge-false',
    UNVERIFIABLE: 'badge-unverifiable',
  };
  return verdictMap[verdict] || 'badge-unverifiable';
};

const getVerdictDisplayName = (verdict: string) => {
  return verdict.replace(/_/g, ' ');
};

export function ResultCard({ report }: ResultCardProps) {
  return (
    <div className="card mb-8 border-2 border-gray-300 dark:border-gray-600">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">Overall Verdict</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {report.reasoning}
          </p>
        </div>
        <span className={`${getVerdictColor(report.verdict)} text-lg`}>
          {getVerdictDisplayName(report.verdict)}
        </span>
      </div>

      {/* Confidence Score with Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold">Confidence Score</span>
          <span className="text-2xl font-bold">
            {(report.confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{ width: `${report.confidence * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}

