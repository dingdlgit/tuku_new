
export class BaseAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Stream chat response
   * @param {Object} params - { message, history, attachments, systemInstruction, res }
   * @returns {Promise<string>} - Full response text
   */
  async chatStream(params) {
    throw new Error("chatStream must be implemented");
  }

  /**
   * Generate Image
   * @param {string} prompt 
   * @returns {Promise<Buffer|string>} - Image buffer or Base64 string
   */
  async generateImage(prompt) {
    throw new Error("generateImage must be implemented");
  }
}
