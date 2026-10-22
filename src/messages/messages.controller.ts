import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /** Customer -> artisan: send the first (or next) message. */
  @Post('conversations')
  start(@Request() req, @Body() dto: StartConversationDto) {
    return this.messagesService.startOrContinue(
      req.user.userId,
      req.user.role,
      dto.artisanProfileId,
      dto.text,
    );
  }

  /** My inbox (customer or artisan, depending on who is logged in). */
  @Get('conversations')
  list(@Request() req) {
    return this.messagesService.listMine(req.user.userId, req.user.role);
  }

  /** Notification bell: unread total + the conversations that have unread messages. */
  @Get('unread')
  unread(@Request() req) {
    return this.messagesService.unreadSummary(req.user.userId, req.user.role);
  }

  /** Customer opens an artisan's page: existing chat with that artisan, if any. */
  @Get('with-artisan/:artisanProfileId')
  withArtisan(@Request() req, @Param('artisanProfileId') artisanProfileId: string) {
    return this.messagesService.getWithArtisan(
      req.user.userId,
      req.user.role,
      artisanProfileId,
    );
  }

  @Get('conversations/:id')
  thread(@Request() req, @Param('id') id: string) {
    return this.messagesService.getThread(req.user.userId, id);
  }

  @Post('conversations/:id/messages')
  reply(@Request() req, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.messagesService.reply(req.user.userId, id, dto.text);
  }
}