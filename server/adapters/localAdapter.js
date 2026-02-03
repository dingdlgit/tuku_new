
import { BaseAdapter } from './baseAdapter.js';
import fetch from 'node-fetch';

export class LocalAdapter extends BaseAdapter {
  constructor() {
    super();
    // Default to common local ports. Should be configurable via ENV.
    this.llmEndpoint = process.env.LOCAL_LLM_URL || 'http://localhost:11434/api/chat'; // Ollama default
    this.sdEndpoint = process.env.LOCAL_SD_URL || 'http://127.0.0.1:7860/sdapi/v1/txt2img'; // Automatic1111 default
  }

  async chatStream({ message, history, systemInstruction, model, res }) {
    // Implementation for Ollama (OpenAI compatible mode or native)
    // Using standard Ollama native API for demonstration of diversity
    
    const messages = [
      { role: "system", content: systemInstruction },
      ...history.map(h => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts[0].text
      })),
      { role: "user", content: message }
    ];

    const body = {
      model: model === 'llama-3-local' ? 'llama3' : 'mistral', // Map internal ID to actual model name
      messages: messages,
      stream: true
    };

    try {
      const response = await fetch(this.llmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error(`Local LLM Error: ${response.statusText}`);

      let fullText = "";
      
      // Node-fetch stream handling
      for await (const chunk of response.body) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
            try {
                const json = JSON.parse(line);
                const token = json.message?.content || ""; // Ollama format
                if (token) {
                    res.write(token);
                    fullText += token;
                }
                if (json.done) break;
            } catch(e) { /* ignore parse errors on chunks */ }
        }
      }
      return fullText;

    } catch (e) {
      const err = `[Local Connection Failed: Ensure Ollama/LocalAI is running at ${this.llmEndpoint}]`;
      res.write(err);
      return err;
    }
  }

  async generateImage(prompt) {
    // Implementation for Stable Diffusion WebUI (Automatic1111)
    const body = {
      prompt: prompt,
      steps: 20,
      width: 512,
      height: 512
    };

    try {
        const response = await fetch(this.sdEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        // SD WebUI returns { images: ["base64..."] }
        return data.images[0];
    } catch (e) {
        console.error("Local SD Error", e);
        return null; // Handle error in caller
    }
  }
}
