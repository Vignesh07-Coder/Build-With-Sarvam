// Minimal smoke test: one Sarvam chat-completion call, nothing else.
// Run with: pnpm --filter @tattva/api exec tsx scripts/sarvam-smoke-test.ts
import { config as loadDotenv } from 'dotenv';
import { SarvamAIClient } from 'sarvamai';

loadDotenv();

const apiKey = process.env.SARVAM_API_KEY;

if (!apiKey) {
  console.error('SARVAM_API_KEY is not set. Add it to apps/api/.env and try again.');
  process.exit(1);
}

const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });

async function main() {
  const response = await client.chat.completions({
    model: 'sarvam-105b',
    messages: [
      {
        role: 'user',
        content:
          'Explain in two sentences why arena allocators can make bulk memory reclamation efficient.',
      },
    ],
  });

  const text = response.choices[0]?.message?.content;
  console.log(text ?? '[no content returned]');
}

main().catch((error) => {
  console.error('Sarvam smoke test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
