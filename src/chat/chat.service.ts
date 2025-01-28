import { Injectable, Sse } from '@nestjs/common';
import { OpenAiService } from '../open-ai/open-ai.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ChatService {
    constructor(private readonly openAiService: OpenAiService,
        private readonly supabaseService: SupabaseService) {}

    async chat(message: string) {
        const prompt = `respond to the following message: ${message}`;
        const response = await this.openAiService.generateResponse(prompt);
        return response;
    }

}
