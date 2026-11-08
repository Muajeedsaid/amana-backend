import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Conversation', index: true })
  conversationId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  senderId: Types.ObjectId;

  @Prop({ required: true, enum: ['customer', 'artisan'] })
  senderRole: string;

  @Prop({ required: true, maxlength: 1000 })
  text: string;

  /** People who used "Delete for me" on this message. Hidden for them only. */
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId }], default: [] })
  deletedFor: Types.ObjectId[];

  /** "Delete for everyone": the text is wiped and both sides see a notice. */
  @Prop({ default: false })
  deletedForEveryone: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: 1 });