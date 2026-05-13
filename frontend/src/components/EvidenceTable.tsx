import type { Evidence } from '../types';

interface EvidenceTableProps {
  evidences: Evidence[];
  title: string;
  bgColor: string;
}

export function EvidenceTable({ evidences, title, bgColor }: EvidenceTableProps) {
  return (
    <div className={`${bgColor} rounded-lg p-6 mb-6`}>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {evidences.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No {title.toLowerCase()} found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="text-left py-2 px-3 font-semibold">Source</th>
                <th className="text-left py-2 px-3 font-semibold">Excerpt</th>
                <th className="text-left py-2 px-3 font-semibold">Credibility</th>
              </tr>
            </thead>
            <tbody>
              {evidences.map((evidence) => (
                <tr
                  key={evidence.id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-opacity-50"
                >
                  <td className="py-3 px-3">
                    <a
                      href={evidence.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline break-words"
                    >
                      {evidence.source}
                    </a>
                  </td>
                  <td className="py-3 px-3 max-w-xs truncate">
                    <span title={evidence.excerpt}>{evidence.excerpt}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-medium">
                      {(evidence.credibilityScore * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

