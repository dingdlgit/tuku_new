
import { BaseAdapter } from './baseAdapter.js';
import OpenAI from 'openai';

export class OpenAIAdapter extends BaseAdapter {
  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
    });
  }

  async chatStream({ message, history, attachments, systemInstruction, model, res }) {
    // 1. Convert Attachments to OpenAI Vision format if present
    const content = [{ type: "text", text: message }];
    
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.data && att.mimeType.startsWith('image/')) {
          content.push({
            type: "image_url",
            image_url: {
              url: `data:${att.mimeType};base64,${att.data}`
            }
          });
        }
      }
    }

    // 2. Convert History
    const messages = [
      { role: "system", content: systemInstruction },
      ...history.map(h => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts[0].text // Simplified history handling for OpenAI
      })),
      { role: "user", content: content }
    ];

    // 3. Call API
    const stream = await this.client.chat.completions.create({
      model: model, // e.g., 'gpt-4o'
      messages: messages,
      stream: true,
    });

    let fullText = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        res.write(delta);
        fullText += delta;
      }
    }

    return fullText;
  }

  async generateImage(prompt) {
    const response = await this.client.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    });

    return response.data[0].b64_json;
  }
}
