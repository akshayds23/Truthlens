import sys

path = 'frontend/src/services/api.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

insert = '''
  checkSimilarClaim: async (text: string): Promise<{
    match: boolean;
    similarity: number;
    claim_id?: string;
    original_text?: string;
    verdict?: string;
  }> => {
    const aiBase = (import.meta as any).env.VITE_AI_API_URL || 'http://localhost:8000';
    try {
      const res = await fetch(`${aiBase}/ai/similar-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return { match: false, similarity: 0 };
      return res.json();
    } catch {
      return { match: false, similarity: 0 };
    }
  },

'''

# Insert before getClaimHistory
marker = '  getClaimHistory:'
content = content.replace(marker, insert + marker, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')

