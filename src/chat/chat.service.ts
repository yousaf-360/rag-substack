import { Injectable, Sse } from '@nestjs/common';
import { OpenAiService } from '../open-ai/open-ai.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly openAiService: OpenAiService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async createChat(chatName: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('chats')
      .insert([{ chat_name: chatName }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getAllChats() {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async getChatMessages(chatId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  async saveMessage(chatId: string, content: string, role: 'user' | 'assistant') {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          chat_id: chatId,
          content,
          role,
        },
      ])
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to save message: ${error.message}`);
    }

    return data;
  }

  async chat(message: string) {
    const embedding =
      await this.openAiService.generateEmbeddingForUserQuery(message);
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.75,
      match_count: 5,
    });
    console.log(data);

    if (error) {
      console.error('Supabase Error:', error);
      return [];
    }

    const contextString = JSON.stringify(data);

    const prompt = `
        System Instructions:

    You are an AI assistant tasked with analyzing the user's query in relation to the provided context. Your goal is to generate a detailed, coherent, and insightful response that integrates relevant information from the context in a logical and meaningful way. In doing so, you must adhere to the following:

    Synthesize information from the context to provide a nuanced and in-depth explanation that is directly aligned with the user's question.
    Your response should not only address the query directly but also offer additional context or background where relevant to enhance the user's understanding.
    Avoid offering responses that are unrelated to the provided context or making assumptions beyond the information given.
    If the context does not provide enough information to adequately answer the query, respond with: "The context does not provide enough information to answer this question."
    Context: ${contextString}

    User Query: ${message}

    Instructions for Response:

    Begin by breaking down the user's query to identify the key concepts and ideas.
    Examine the provided context to extract the most relevant pieces of information that can help address the user's question.
    Construct a clear and detailed response by weaving together the context and query, ensuring the response is both comprehensive and easy to understand.
    Ensure your answer goes beyond simple facts—offer insights, elaborate on connections, and explain how different elements of the context interrelate to provide a complete response.
    If the user sends a greeting or casual message, respond naturally without using the context.
    Maintain a neutral, informative tone and prioritize clarity and thoroughness in your response.
    Don't mention things like based on provided context, based on user's query etc. These things make answer look unprofessional and destroy the user experience.
        `;

    const response = await this.openAiService.generateResponse(prompt);
    return response;
  }
}
