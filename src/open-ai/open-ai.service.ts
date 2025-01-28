import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

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
                model: 'gpt-3.5-turbo', 
                messages: [
                    {
                        role: 'user',
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
}
