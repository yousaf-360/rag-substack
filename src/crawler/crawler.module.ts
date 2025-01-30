import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { SupabaseService } from 'src/supabase/supabase.service';
import { OpenAiService } from 'src/open-ai/open-ai.service';
@Module({
  providers: [CrawlerService,SupabaseService,OpenAiService],
  controllers: [CrawlerController]
})
export class CrawlerModule {}
