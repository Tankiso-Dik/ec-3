import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '../../../lib/systemPrompt';

// Simple wrapper around OpenRouter API
export async function POST(request) {
  const body = await request.json();

  const {
    prompt,
    history = [], // [{ role: 'user'|'assistant', content: string }]
    temperature = 0.7,
    top_p = 1,
    max_tokens = 4096,
    system = SYSTEM_PROMPT
  } = body || {};

  if (!prompt) {
    return NextResponse.json(
      { reply: '⚠️ No message received.' },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set.');
    return NextResponse.json(
      { reply: '⚠️ Server configuration error: API key missing.' },
      { status: 500 }
    );
  }

  const models = [
    'meta-llama/llama-3.3-8b-instruct:free',
    'qwen/qwen2-7b-instruct:free',
    'google/gemma-2-9b-it:free',
    'nousresearch/hermes-2-pro-llama-3-8b:free'
  ];

  for (const model of models) {
    try {
      const url = 'https://openrouter.ai/api/v1/chat/completions';

      const mappedHistory = Array.isArray(history)
        ? history.map((m) => ({
            role: m?.role,
            content: m?.content
          }))
        : [];

      const messages = [
        { role: 'system', content: system },
        ...mappedHistory,
        { role: 'user', content: prompt }
      ];

      const payload = {
        model: model,
        messages: messages,
        temperature: temperature,
        top_p: top_p,
        max_tokens: max_tokens,
        stream: false
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const result = await res.json();

      if (res.ok) {
        const reply = result?.choices?.[0]?.message?.content || '⚠️ No response from OpenRouter.';
        return NextResponse.json({ reply });
      } else {
        console.error(`OpenRouter error with model ${model}:`, res.status, result);
        if (models.indexOf(model) < models.length - 1) {
          continue;
        }
        const message = result?.error?.message || res.statusText || 'Unknown error';
        return NextResponse.json(
          { reply: `⚠️ OpenRouter error: ${message}` },
          { status: res.status }
        );
      }
    } catch (err) {
      console.error(`Fetch error with model ${model}:`, err);
      if (models.indexOf(model) < models.length - 1) {
        continue;
      }
      return NextResponse.json(
        { reply: '⚠️ Error reaching OpenRouter API.' },
        { status: 500 }
      );
    }
  }
}
