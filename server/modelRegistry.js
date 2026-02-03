
import { OpenAIAdapter } from './adapters/openaiAdapter.js';
import { LocalAdapter } from './adapters/localAdapter.js';

class ModelRegistry {
  constructor() {
    this.adapters = new Map();
    this.initialize();
  }

  initialize() {
    const openAI = new OpenAIAdapter();
    const local = new LocalAdapter();

    // Register OpenAI Models
    this.adapters.set('gpt-4o', openAI);
    this.adapters.set('gpt-4-turbo', openAI);

    // Register Local/Open Source Models
    this.adapters.set('llama-3-local', local);
    this.adapters.set('mistral-local', local);
    this.adapters.set('stable-diffusion-xl', local);
  }

  getAdapter(modelId) {
    return this.adapters.get(modelId);
  }

  isGemini(modelId) {
    return modelId.startsWith('gemini') || modelId.startsWith('veo');
  }
}

export const registry = new ModelRegistry();
