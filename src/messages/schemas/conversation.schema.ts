import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

/**
 * One conversation per (customer, artisan profile) pair.
 * Unread counters live here so the notification bell is a single cheap query.
 */
@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ArtisanProfile' })
  artisanProfileId: Types.ObjectId;

  /** The artisan's User id, copied here so we can find their inbox without a join. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  artisanUserId: Types.ObjectId;

  @Prop({ default: '' })
  lastMessage: string;

  @Prop({ type: Date })
  lastMessageAt?: Date;

  @Prop({ enum: ['customer', 'artisan'] })
  lastSenderRole?: string;

  /** Messages the customer has not opened yet (sent by the artisan). */
  @Prop({ default: 0 })
  customerUnread: number;

  /** Messages the artisan has not opened yet (sent by the customer). */
  @Prop({ default: 0 })
  artisanUnread: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ customerId: 1, artisanProfileId: 1 }, { unique: true });
ConversationSchema.index({ artisanUserId: 1, lastMessageAt: -1 });
ConversationSchema.index({ customerId: 1, lastMessageAt: -1 });