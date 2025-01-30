import { Controller, Body, Sse, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';

type CustomMessageEvent = {
    data: { type: string; content?: any; fullMessage?: string; chatId?: string };
    type: string;
    lastEventId: string;
    origin: string;
  };

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @Post('')
    @Sse()
    async chat(@Body() body: { message: string }) {
        let fullMessage = '';
        const response = await this.chatService.chat(body.message);
        return from(response).pipe(
            map((data) => {
                if (data.choices[0].delta.content) {
                    fullMessage += data.choices[0].delta.content;
                    return { 
                        data: {
                            type: 'chunk',
                            content: data.choices[0].delta.content,
                        }
                    };
                }
                console.log(fullMessage);
                return {
                    data: {
                        type: 'complete',
                        content: fullMessage,
                        fullMessage
                    }
                };
            })
        );
    }
}
