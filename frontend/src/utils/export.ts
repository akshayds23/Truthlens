/**
 * Export utilities for TruthLens
 * Handle Markdown and PDF exports of fact-check reports
 */

import { FactCheckReport } from '../types';

/**
 * Convert report to Markdown format
 */
export const exportToMarkdown = (report: FactCheckReport & { claimText?: string }): string => {
  let markdown = `# Fact-Check Report\n\n`;

  markdown += `**Claim:** ${report.claimText || 'Unknown'}\n\n`;
  markdown += `**Verdict:** ${report.verdict} (Confidence: ${(report.confidence * 100).toFixed(1)}%)\n\n`;

  markdown += `## Summary\n`;
  markdown += `${report.reasoning}\n\n`;

  if (report.supportingEvidence && report.supportingEvidence.length > 0) {
    markdown += `## Supporting Evidence\n`;
    report.supportingEvidence.forEach((evidence: any, i: number) => {
      markdown += `### ${i + 1}. ${evidence.text?.substring(0, 100) || evidence.excerpt?.substring(0, 100)}...\n`;
      markdown += `- **Source:** ${evidence.source}\n`;
      markdown += `- **Relevance:** ${((evidence.relevance || 1) * 100).toFixed(0)}%\n\n`;
    });
  }

  if (report.contradictingEvidence && report.contradictingEvidence.length > 0) {
    markdown += `## Contradicting Evidence\n`;
    report.contradictingEvidence.forEach((evidence: any, i: number) => {
      markdown += `### ${i + 1}. ${evidence.text?.substring(0, 100) || evidence.excerpt?.substring(0, 100)}...\n`;
      markdown += `- **Source:** ${evidence.source}\n`;
      markdown += `- **Relevance:** ${((evidence.relevance || 1) * 100).toFixed(0)}%\n\n`;
    });
  }

  if (report.citations && report.citations.length > 0) {
    markdown += `## Sources\n`;
    report.citations.forEach((source: any, i: number) => {
      markdown += `${i + 1}. [${source.title}](${source.url})\n`;
      if (source.credibilityScore) {
        markdown += `   Credibility: ${(source.credibilityScore * 100).toFixed(0)}%\n`;
      }
    });
  }

  markdown += `\n---\n`;
  markdown += `**Report Generated:** ${new Date().toLocaleString()}\n`;
  markdown += `**Source:** TruthLens AI\n`;

  return markdown;
};

/**
 * Convert report to JSON format
 */
export const exportToJSON = (report: FactCheckReport): string => {
  return JSON.stringify(report, null, 2);
};

/**
 * Download file helper
 */
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const element = document.createElement('a');
  const file = new Blob([content], { type: mimeType });

  element.href = URL.createObjectURL(file);
  element.download = filename;

  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(element.href);
};

/**
 * Export report as Markdown file
 */
export const downloadMarkdown = (report: FactCheckReport) => {
  const markdown = exportToMarkdown(report);
  const filename = `report-${Date.now()}.md`;
  downloadFile(markdown, filename, 'text/markdown');
};

/**
 * Export report as JSON file
 */
export const downloadJSON = (report: FactCheckReport) => {
  const json = exportToJSON(report);
  const filename = `report-${Date.now()}.json`;
  downloadFile(json, filename, 'application/json');
};

/**
 * Generate PDF (basic implementation)
 * Note: For production, use a library like jsPDF or html2pdf
 */
export const downloadPDF = async (report: FactCheckReport) => {
  try {
    // For MVP, we'll use the browser's print-to-PDF feature
    // In production, integrate with jsPDF or similar library
    const printWindow = window.open('', '', 'height=400,width=600');
    if (!printWindow) {
      throw new Error('Failed to open print window');
    }

    const html = generateHTMLForPrint(report);
    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load before printing
    setTimeout(() => {
      printWindow.print();
    }, 100);
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw new Error('Failed to generate PDF');
  }
};

/**
 * Generate HTML for printing
 */
const generateHTMLForPrint = (report: FactCheckReport & { claimText?: string }): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fact-Check Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 40px;
        }
        h1, h2 { color: #2c3e50; }
        .verdict {
          padding: 15px;
          background-color: #f0f4f8;
          border-left: 4px solid #3498db;
          margin: 20px 0;
        }
        .evidence {
          margin: 15px 0;
          padding: 10px;
          background-color: #fafafa;
          border-left: 3px solid #e0e0e0;
        }
        .source {
          color: #3498db;
          text-decoration: underline;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #f0f4f8;
        }
      </style>
    </head>
    <body>
      <h1>Fact-Check Report</h1>
      
      <h2>Claim</h2>
      <p>${report.claimText || 'Unknown'}</p>
      
      <div class="verdict">
        <strong>Verdict:</strong> ${report.verdict}<br/>
        <strong>Confidence:</strong> ${(report.confidence * 100).toFixed(1)}%
      </div>
      
      <h2>Explanation</h2>
      <p>${report.reasoning}</p>
      
      ${report.citations && report.citations.length > 0 ? `
        <h2>Sources</h2>
        <table>
          <tr>
            <th>Title</th>
            <th>Credibility</th>
          </tr>
          ${report.citations.map((source: any) => `
            <tr>
              <td><a href="${source.url}" class="source">${source.title}</a></td>
              <td>${source.credibilityScore ? (source.credibilityScore * 100).toFixed(0) + '%' : 'N/A'}</td>
            </tr>
          `).join('')}
        </table>
      ` : ''}
      
      <hr/>
      <p><small>Generated: ${new Date().toLocaleString()} | Source: TruthLens AI</small></p>
    </body>
    </html>
  `;
};

/**
 * Copy report to clipboard
 */
export const copyToClipboard = async (report: FactCheckReport, format: 'markdown' | 'json' = 'markdown') => {
  try {
    const content = format === 'markdown' ? exportToMarkdown(report) : exportToJSON(report);
    await navigator.clipboard.writeText(content);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};
