import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { Embedding, Chunk } from 'src/types/openai.embeddings.types';

@Injectable()
export class OpenAiService {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateResponse(prompt: string) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
        stream: true,
      });

      return response;
    } catch (error) {
      const e = error as Error;
      throw new Error(`OpenAI API Error: ${e.message}`);
    }
  }

  async generateEmbeddingForUserQuery(query:string):Promise<number[]>{
    try{
      const response = await this.openai.embeddings.create({
        model:'text-embedding-ada-002',
        input:query
      })
      return response.data[0].embedding
    }catch(error){
      const e = error as Error;
      throw new Error(`OpenAI API Error: ${e.message}`);
    }
  }

  async generateEmbeddingsForWebsites(
    link: string,
    content: string,
    answer: Embedding[],
  ): Promise<Embedding[]> {
    try {
      const chunks = await this.genertechunkks(content);
      for (const chunk of chunks) {
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: chunk.chunk,
        });
        answer.push({
          content: chunk.chunk,
          metadata: { start: chunk.start, end: chunk.end, link: link },
          embeddings: response.data[0].embedding,
        });
      }
      return answer;
    } catch (error) {
      const e = error as Error;
      throw new Error(`OpenAI API Error: ${e.message}`);
    }
  }

  private async genertechunkks(text: string): Promise<Chunk[]> {
    const chunSize = 1000;
    const overpping = 200;
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      const chunk = text.slice(start, start + chunSize);
      chunks.push({ start, end: start + chunSize, chunk });
      start += chunSize - overpping;
    }
    return chunks;
  }
}
