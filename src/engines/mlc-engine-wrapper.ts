// src/engines/mlc-engine-wrapper.ts
import { CreateMLCEngine, MLCEngineInterface } from "@mlc-ai/web-llm";
import { ModelConfig } from "../config/models/types";

export class MLCEngineWrapper {
  private mlcEngine: MLCEngineInterface | null = null;

  constructor() {
    this.mlcEngine = null;
  }

  async loadModel(modelConfig: ModelConfig  , options: any = {}) {
    try {
      const modelIdentifier = modelConfig.repo.replace("{quantization}", modelConfig.defaultQuantization);
      this.mlcEngine = await CreateMLCEngine(modelIdentifier, {
        initProgressCallback: options.onProgress, // Pass progress callback
        ...options, // Pass other options
      });
    } catch (error) {
      console.error("Error loading MLC model:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load MLC model "${modelConfig}": ${message}`);
    }
  }

  async generateText(prompt: string, options: any = {}) {
    if (!this.mlcEngine) {
      throw new Error("MLC Engine not initialized.");
    }
    const messages = [{role: "user", content: prompt}];
    if (options.system_prompt) {
      messages.push({role: "system", content: options.system_prompt});
    }
    if (!options.max_tokens) {
      options.max_tokens = 100;
    }
    if (!options.temperature) {
      options.temperature = 0.5;
    }
    const result = await this.mlcEngine.chat.completions.create({messages: messages, ...options});
    return result.choices[0].message.content;
  }
}
