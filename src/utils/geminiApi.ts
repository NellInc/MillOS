/**
 * Gemini 3 Flash API Utilities
 *
 * Real API calls to Google's Gemini 3 Flash model for strategic decisions.
 * Includes cost tracking and fallback to heuristic mode.
 */

import { useAIConfigStore } from '../stores/aiConfigStore';

// Gemini 3 Flash pricing (as of Dec 2024)
const GEMINI_PRICING = {
  inputTokens: 0.075 / 1_000_000, // $0.075 per 1M input tokens
  outputTokens: 0.3 / 1_000_000, // $0.30 per 1M output tokens
};

// Estimate tokens from text (rough approximation)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

interface GeminiResponse {
  success: boolean;
  content?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number;
  error?: string;
}

interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/**
 * Call Gemini 3 Flash API
 */
export async function callGeminiFlash(
  prompt: string,
  systemInstruction?: string
): Promise<GeminiResponse> {
  const store = useAIConfigStore.getState();
  const apiKey = store.geminiApiKey;

  if (!apiKey) {
    return {
      success: false,
      error: 'No Gemini API key configured',
    };
  }

  try {
    const messages: GeminiMessage[] = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const requestBody: Record<string, unknown> = {
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API error ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();

    // Extract content
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Calculate token usage and cost
    const promptTokens = estimateTokens(prompt + (systemInstruction || ''));
    const completionTokens = estimateTokens(content);
    const totalTokens = promptTokens + completionTokens;
    const cost =
      promptTokens * GEMINI_PRICING.inputTokens + completionTokens * GEMINI_PRICING.outputTokens;

    // Track cost in store
    store.trackAPICost(cost, totalTokens);

    return {
      success: true,
      content,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      cost,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate a strategic decision using Gemini 3 Flash
 */
export async function generateStrategicDecision(
  factoryContext: string,
  vclEncoding: string
): Promise<GeminiResponse> {
  const systemInstruction = `You are a strategic AI advisor for a grain mill factory.
Analyze the factory state and VCL encoding to provide ONE actionable recommendation.
Respond in JSON format:
{
  "type": "optimization" | "maintenance" | "assignment" | "safety" | "prediction",
  "action": "brief action description",
  "reasoning": "why this is recommended",
  "confidence": 0-100,
  "priority": "low" | "medium" | "high" | "critical",
  "recommendWorker": "optional worker name if assignment",
  "affectedMachineId": "optional machine ID"
}`;

  const prompt = `Factory State:
${factoryContext}

VCL Encoding:
${vclEncoding}

Provide your strategic recommendation:`;

  return callGeminiFlash(prompt, systemInstruction);
}

/**
 * Parse Gemini response into AIDecision format
 */
export function parseGeminiDecision(response: GeminiResponse): Record<string, unknown> | null {
  if (!response.success || !response.content) {
    return null;
  }

  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      type: parsed.type || 'optimization',
      action: parsed.action || 'Unknown action',
      reasoning: parsed.reasoning || 'AI recommendation',
      confidence: parsed.confidence || 75,
      priority: parsed.priority || 'medium',
      recommendWorker: parsed.recommendWorker,
      affectedMachineId: parsed.affectedMachineId,
    };
  } catch {
    return null;
  }
}
