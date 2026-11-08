import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import {
  ArtisanProfile,
  ArtisanProfileDocument,
} from '../profiles/schemas/artisan-profile.schema';

type Side = 'customer' | 'artisan';

export interface ConversationSummary {
  _id: string;
  artisanProfileId: string;
  with: { name: string; subtitle: string; avatarUrl: string };
  lastMessage: string;
  lastMessageAt: Date | null;
  lastSenderRole: string | null;
  unread: number;
}

export interface ThreadMessage {
  _id: string;
  senderRole: string;
  text: string;
  createdAt: Date;
  mine: boolean;
  deleted: boolean;
}

function assertObjectId(id: string, label = 'id') {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ${label}`);
  }
}

function cleanText(text: string) {
  const body = (text ?? '').trim();

  if (!body) throw new BadRequestException('Message cannot be empty');
  if (body.length > 1000) throw new BadRequestException('Message is too long (max 1000 characters)');

  return body;
}

/** 07069419288 -> 0706••••288 : enough for the artisan to tell customers apart. */
function maskPhone(phone: string) {
  if (!phone) return 'Customer';
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(ArtisanProfile.name)
    private readonly profileModel: Model<ArtisanProfileDocument>,
  ) {}

  /* ---------------------------------------------------------
     SIDE HELPERS
  --------------------------------------------------------- */

  /** Which side of conversations does this account sit on? */
  private sideFor(role: string): Side {
    return role === 'artisan' ? 'artisan' : 'customer';
  }

  private participantSide(conversation: ConversationDocument, userId: string): Side {
    if (conversation.customerId.toString() === userId) return 'customer';
    if (conversation.artisanUserId.toString() === userId) return 'artisan';
    throw new ForbiddenException('You are not part of this conversation');
  }

  private async loadConversation(conversationId: string, userId: string) {
    assertObjectId(conversationId, 'conversation id');

    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');

    const side = this.participantSide(conversation, userId);
    return { conversation, side };
  }

  /* ---------------------------------------------------------
     SUMMARIES (who is on the other end)
  --------------------------------------------------------- */

  private async summarise(
    conversations: ConversationDocument[],
    side: Side,
  ): Promise<ConversationSummary[]> {
    if (conversations.length === 0) return [];

    const customers = new Map<string, string>();
    const profiles = new Map<string, ArtisanProfileDocument>();

    if (side === 'artisan') {
      const users = await this.userModel
        .find({ _id: { $in: conversations.map((c) => c.customerId) } })
        .select('phone')
        .lean();
      users.forEach((u) => customers.set(u._id.toString(), u.phone));
    } else {
      const found = await this.profileModel.find({
        _id: { $in: conversations.map((c) => c.artisanProfileId) },
      });
      found.forEach((p) => profiles.set(p._id.toString(), p));
    }

    return conversations.map((c) => {
      let name = 'Customer';
      let subtitle = '';
      let avatarUrl = '';

      if (side === 'artisan') {
        name = maskPhone(customers.get(c.customerId.toString()) || '');
        subtitle = 'Customer';
      } else {
        const p = profiles.get(c.artisanProfileId.toString()) as any;
        name = p?.businessName || p?.fullName || p?.tradeCategory || 'Artisan';
        subtitle = p?.tradeCategory || '';
        avatarUrl = p?.avatarUrl || '';
      }

      return {
        _id: c._id.toString(),
        artisanProfileId: c.artisanProfileId.toString(),
        with: { name, subtitle, avatarUrl },
        lastMessage: c.lastMessage || '',
        lastMessageAt: c.lastMessageAt ?? null,
        lastSenderRole: c.lastSenderRole ?? null,
        unread: side === 'artisan' ? c.artisanUnread : c.customerUnread,
      };
    });
  }

  /* ---------------------------------------------------------
     WRITE: new message
  --------------------------------------------------------- */

  private async addMessage(
    conversation: ConversationDocument,
    senderId: string,
    side: Side,
    text: string,
  ) {
    const message = await this.messageModel.create({
      conversationId: conversation._id,
      senderId: new Types.ObjectId(senderId),
      senderRole: side,
      text,
    });

    // Atomic: bump the *other* side's unread counter.
    await this.conversationModel.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessage: text.slice(0, 160),
          lastMessageAt: message.get('createdAt') ?? new Date(),
          lastSenderRole: side,
        },
        $inc: side === 'customer' ? { artisanUnread: 1 } : { customerUnread: 1 },
      },
    );

    return message;
  }

  /** Customer sends a message to an artisan (starts the thread if needed). */
  async startOrContinue(userId: string, role: string, artisanProfileId: string, text: string) {
    if (this.sideFor(role) !== 'customer') {
      throw new ForbiddenException('Please use a customer account to message an artisan');
    }

    const profile = await this.profileModel.findById(artisanProfileId);
    if (!profile) throw new NotFoundException('Artisan not found');

    if (profile.userId.toString() === userId) {
      throw new BadRequestException('You cannot message yourself');
    }

    const body = cleanText(text);
    const pair = {
      customerId: new Types.ObjectId(userId),
      artisanProfileId: profile._id,
    };

    let conversation: ConversationDocument | null;

    try {
      conversation = await this.conversationModel.findOneAndUpdate(
        pair,
        { $setOnInsert: { artisanUserId: profile.userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (error: any) {
      // Two first messages at the same instant: the other one created it. Just use it.
      if (error?.code !== 11000) throw error;
      conversation = await this.conversationModel.findOne(pair);
    }

    if (!conversation) throw new NotFoundException('Conversation not found');

    const message = await this.addMessage(conversation, userId, 'customer', body);

    return {
      conversationId: conversation._id.toString(),
      message: this.toThreadMessage(message, userId),
    };
  }

  /** Either side replies inside an existing conversation. */
  async reply(userId: string, conversationId: string, text: string) {
    const { conversation, side } = await this.loadConversation(conversationId, userId);
    const message = await this.addMessage(conversation, userId, side, cleanText(text));

    return { message: this.toThreadMessage(message, userId) };
  }

  /* ---------------------------------------------------------
     READ
  --------------------------------------------------------- */

  private toThreadMessage(message: MessageDocument, userId: string): ThreadMessage {
    return {
      _id: message._id.toString(),
      senderRole: message.senderRole,
      text: message.deletedForEveryone ? '' : message.text,
      createdAt: message.get('createdAt'),
      mine: message.senderId.toString() === userId,
      deleted: !!message.deletedForEveryone,
    };
  }

  /** When did this person last "delete" the chat? Messages before that are hidden for them only. */
  private clearedAtFor(conversation: ConversationDocument, side: Side): Date | null {
    const value = side === 'artisan' ? conversation.artisanClearedAt : conversation.customerClearedAt;
    return value ?? null;
  }

  /** A deleted chat stays hidden until a newer message arrives. */
  private isVisible(conversation: ConversationDocument, side: Side) {
    if (!conversation.lastMessageAt) return false;
    const clearedAt = this.clearedAtFor(conversation, side);
    return !clearedAt || conversation.lastMessageAt > clearedAt;
  }

  /**
   * "Delete chat" for ONE side only (like WhatsApp). The other person keeps their copy.
   * If both sides delete, the conversation and its messages are removed for good.
   */
  async deleteForMe(userId: string, conversationId: string) {
    const { conversation, side } = await this.loadConversation(conversationId, userId);
    const now = new Date();

    const mine = side === 'artisan' ? 'artisanClearedAt' : 'customerClearedAt';
    const theirs = side === 'artisan' ? conversation.customerClearedAt : conversation.artisanClearedAt;

    const lastAt = conversation.lastMessageAt;
    const otherSideGone = !!theirs && !!lastAt && lastAt <= theirs;

    if (otherSideGone) {
      await this.messageModel.deleteMany({ conversationId: conversation._id });
      await this.conversationModel.deleteOne({ _id: conversation._id });
      return { deleted: true };
    }

    await this.conversationModel.updateOne(
      { _id: conversation._id },
      {
        $set: {
          [mine]: now,
          ...(side === 'artisan' ? { artisanUnread: 0 } : { customerUnread: 0 }),
        },
      },
    );

    return { deleted: true };
  }

  /** "Delete chat for everyone": the conversation and every message in it are removed for both sides. */
  async deleteConversationForEveryone(userId: string, conversationId: string) {
    const { conversation } = await this.loadConversation(conversationId, userId);

    await this.messageModel.deleteMany({ conversationId: conversation._id });
    await this.conversationModel.deleteOne({ _id: conversation._id });

    return { deleted: true };
  }

  /** "Delete for me" on a single message. The other person still sees it. */
  async deleteMessageForMe(userId: string, messageId: string) {
    assertObjectId(messageId, 'message id');

    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');

    // Only people inside this conversation may touch its messages.
    await this.loadConversation(message.conversationId.toString(), userId);

    await this.messageModel.updateOne(
      { _id: message._id },
      { $addToSet: { deletedFor: new Types.ObjectId(userId) } },
    );

    return { deleted: true };
  }

  /**
   * "Delete for everyone": only the sender, and only within 48 hours (like WhatsApp).
   * The text is wiped for both sides and a "This message was deleted" notice stays.
   */
  async deleteMessageForEveryone(userId: string, messageId: string) {
    assertObjectId(messageId, 'message id');

    const message = await this.messageModel.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');

    const { conversation } = await this.loadConversation(
      message.conversationId.toString(),
      userId,
    );

    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own messages for everyone');
    }

    const createdAt = new Date(message.get('createdAt')).getTime();
    if (Date.now() - createdAt > 48 * 60 * 60 * 1000) {
      throw new BadRequestException('This message is too old to delete for everyone');
    }

    await this.messageModel.updateOne(
      { _id: message._id },
      { $set: { deletedForEveryone: true, text: '' } },
    );

    // If it was the latest message, fix the preview in the inbox list.
    const last = conversation.lastMessageAt ? conversation.lastMessageAt.getTime() : 0;
    if (createdAt >= last - 1000) {
      await this.conversationModel.updateOne(
        { _id: conversation._id },
        { $set: { lastMessage: '🚫' } },
      );
    }

    return { deleted: true };
  }

  /** Opening a thread marks it as read for the person looking at it. */
  private async openThread(conversation: ConversationDocument, side: Side, userId: string) {
    const clearedAt = this.clearedAtFor(conversation, side);

    const [messages] = await Promise.all([
      this.messageModel
        .find({
          conversationId: conversation._id,
          deletedFor: { $ne: new Types.ObjectId(userId) },
          ...(clearedAt ? { createdAt: { $gt: clearedAt } } : {}),
        })
        .sort({ createdAt: 1 })
        .limit(300),
      this.conversationModel.updateOne(
        { _id: conversation._id },
        side === 'artisan' ? { $set: { artisanUnread: 0 } } : { $set: { customerUnread: 0 } },
      ),
    ]);

    const [summary] = await this.summarise([conversation], side);

    return {
      conversation: { ...summary, unread: 0 },
      messages: messages.map((m) => this.toThreadMessage(m, userId)),
    };
  }

  async getThread(userId: string, conversationId: string) {
    const { conversation, side } = await this.loadConversation(conversationId, userId);
    return this.openThread(conversation, side, userId);
  }

  /** Used by the artisan page: is there already a chat with this artisan? */
  async getWithArtisan(userId: string, role: string, artisanProfileId: string) {
    assertObjectId(artisanProfileId, 'artisan id');

    if (this.sideFor(role) !== 'customer') {
      return { conversation: null, messages: [] };
    }

    const conversation = await this.conversationModel.findOne({
      customerId: new Types.ObjectId(userId),
      artisanProfileId: new Types.ObjectId(artisanProfileId),
    });

    if (!conversation) return { conversation: null, messages: [] };

    return this.openThread(conversation, 'customer', userId);
  }

  async listMine(userId: string, role: string) {
    const side = this.sideFor(role);

    const conversations = await this.conversationModel
      .find(
        side === 'artisan'
          ? { artisanUserId: new Types.ObjectId(userId) }
          : { customerId: new Types.ObjectId(userId) },
      )
      .sort({ lastMessageAt: -1 })
      .limit(50);

    return this.summarise(
      conversations.filter((c) => this.isVisible(c, side)),
      side,
    );
  }

  /** Feeds the notification bell. Does NOT mark anything as read. */
  async unreadSummary(userId: string, role: string) {
    const side = this.sideFor(role);
    const field = side === 'artisan' ? 'artisanUnread' : 'customerUnread';
    const owner =
      side === 'artisan'
        ? { artisanUserId: new Types.ObjectId(userId) }
        : { customerId: new Types.ObjectId(userId) };

    const unread = (
      await this.conversationModel
        .find({ ...owner, [field]: { $gt: 0 } })
        .sort({ lastMessageAt: -1 })
        .limit(20)
    ).filter((c) => this.isVisible(c, side));

    const items = await this.summarise(unread, side);
    const count = unread.reduce((sum, c) => sum + (c as any)[field], 0);

    return { count, items };
  }
}