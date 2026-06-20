/**
 * Mock Test Data for Results.tsx Page
 * This demonstrates the expected structure and rendering of the Results page
 */

import type { FactCheckReport } from '../types';

export const mockFactCheckReport: FactCheckReport = {
  id: 'report-001',
  claimId: 'claim-001',
  verdict: 'MOSTLY_TRUE',
  confidence: 0.87,
  reasoning:
    'The claim contains mostly accurate information. While the main assertion is supported by scientific evidence, some nuances and contextual details are missing.',
  subClaims: [
    {
      id: 'subclaim-001',
      text: 'The earth is approximately 4.5 billion years old',
      verdict: 'TRUE',
      confidence: 0.99,
      evidence: [
        {
          id: 'evidence-001',
          source: 'USGS Geological Survey',
          sourceUrl: 'https://www.usgs.gov/faqs/how-old-earth',
          excerpt: 'Scientific consensus places Earth age at approximately 4.54 billion years',
          credibilityScore: 0.95,
          isSupporting: true,
        },
      ],
    },
    {
      id: 'subclaim-002',
      text: 'Human activities contribute significantly to climate change',
      verdict: 'TRUE',
      confidence: 0.93,
      evidence: [
        {
          id: 'evidence-002',
          source: 'IPCC Climate Report',
          sourceUrl: 'https://www.ipcc.ch/report/',
          excerpt:
            'It is unequivocal that human influence has warmed the climate system',
          credibilityScore: 0.98,
          isSupporting: true,
        },
      ],
    },
    {
      id: 'subclaim-003',
      text: 'Renewable energy can completely replace fossil fuels',
      verdict: 'MISLEADING',
      confidence: 0.76,
      evidence: [
        {
          id: 'evidence-003',
          source: 'Energy Research Institute',
          sourceUrl: 'https://www.energy-institute.org/research',
          excerpt:
            'While renewable energy potential is significant, complete replacement requires significant infrastructure development',
          credibilityScore: 0.85,
          isSupporting: false,
        },
      ],
    },
  ],
  supportingEvidence: [
    {
      id: 'supp-evidence-001',
      source: 'National Academy of Sciences',
      sourceUrl: 'https://www.nasonline.org',
      excerpt:
        'The warming of the climate system is unequivocal, as is now evident from observations of increases in global average air and ocean temperatures',
      credibilityScore: 0.96,
      isSupporting: true,
    },
    {
      id: 'supp-evidence-002',
      source: 'Harvard Climate Science',
      sourceUrl: 'https://www.harvard.edu/climate-research',
      excerpt:
        'Peer-reviewed studies overwhelmingly support the connection between human activities and global warming',
      credibilityScore: 0.92,
      isSupporting: true,
    },
  ],
  contradictingEvidence: [
    {
      id: 'contra-evidence-001',
      source: 'Alternative Climate Perspective',
      sourceUrl: 'https://www.alternative-climate.org',
      excerpt: 'Some argue that natural climate cycles play a larger role than previously thought',
      credibilityScore: 0.42,
      isSupporting: false,
    },
  ],
  citations: [
    {
      id: 'citation-001',
      url: 'https://www.ipcc.ch/ar6/wg1/',
      title: 'IPCC Sixth Assessment Report - Working Group I',
      credibilityScore: 0.98,
      excerpt: 'Climate Change 2021: The Physical Science Basis',
    },
    {
      id: 'citation-002',
      url: 'https://www.nasa.gov/climate',
      title: 'NASA Climate Change Portal',
      credibilityScore: 0.96,
      excerpt: 'Official NASA climate science resources and data',
    },
    {
      id: 'citation-003',
      url: 'https://www.noaa.gov/climate',
      title: 'NOAA Climate Science',
      credibilityScore: 0.95,
      excerpt: 'National Oceanic and Atmospheric Administration climate data',
    },
    {
      id: 'citation-004',
      url: 'https://www.usgs.gov/climate-land-use',
      title: 'USGS Climate and Land Use Change',
      credibilityScore: 0.93,
      excerpt: 'US Geological Survey climate research',
    },
  ],
  createdAt: new Date().toISOString(),
};

/**
 * Usage in Results.tsx Testing:
 *
 * 1. Mock the useApp hook to return this report:
 *    jest.mock('../store/appContext', () => ({
 *      useApp: () => ({ currentReport: mockFactCheckReport })
 *    }));
 *
 * 2. Render the Results component:
 *    render(<Results />);
 *
 * 3. Verify sections render:
 *    - Overall verdict card shows "MOSTLY_TRUE"
 *    - Confidence shows "87.0%"
 *    - 3 sub-claims displayed
 *    - 2 supporting evidence entries
 *    - 1 contradicting evidence entry
 *    - 4 citations sorted by credibility
 *
 * 4. Test interactive features:
 *    - Click sub-claim to expand/collapse
 *    - Export buttons functional
 *    - Navigation buttons work
 */
