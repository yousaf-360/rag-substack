import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { OpenAiModule } from '../open-ai/open-ai.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  providers: [ChatService],
  controllers: [ChatController],
  imports: [OpenAiModule, SupabaseModule]
})
export class ChatModule {}
