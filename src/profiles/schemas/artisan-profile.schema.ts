import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtisanProfileDocument = ArtisanProfile & Document;

@Schema({ _id: false })
export class SocialMedia {
  @Prop({ default: '' })
  instagram: string;

  @Prop({ default: '' })
  facebook: string;

  @Prop({ default: '' })
  tiktok: string;
}

@Schema({ _id: false })
export class CustomOffering {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  category: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 'pending', enum: ['pending', 'approved'] })
  status: string;
}

@Schema({ timestamps: true })
export class ArtisanProfile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  tradeCategory: string;

  @Prop({ default: '' })
  bio: string;

  @Prop({ default: [] })
  skills: string[];

  @Prop({ default: 0 })
  yearsExperience: number;

  @Prop({ default: 5 })
  serviceRadiusKm: number;

  @Prop({
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
  })
  location: {
    type: string;
    coordinates: number[];
  };

  @Prop({ default: [] })
  portfolioPhotos: string[];

  @Prop({ default: false })
  isAvailable: boolean;

  @Prop({ default: 'unverified', enum: ['unverified', 'pending', 'verified'] })
  verificationStatus: string;

  @Prop({ default: 0 })
  ratingAvg: number;

  @Prop({ default: 0 })
  ratingCount: number;

  @Prop({ type: SocialMedia, default: () => ({}) })
  socialMedia: SocialMedia;

  /* ---- identity ---- */

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ default: '' })
  fullName: string;

  @Prop({ default: '' })
  businessName: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  whatsapp: string;

  @Prop({ default: 'Kano' })
  city: string;

  @Prop({ default: '' })
  area: string;

  /* ---- what they offer ---- */

  @Prop({ default: 'services', enum: ['services', 'products', 'both'] })
  offerType: string;

  @Prop({ default: [] })
  serviceIds: string[];

  @Prop({ default: [] })
  productIds: string[];

  @Prop({ type: [CustomOffering], default: [] })
  customOfferings: CustomOffering[];

  /* ---- hours ---- */

  @Prop({ default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] })
  workingDays: string[];

  @Prop({ default: '08:00' })
  openFrom: string;

  @Prop({ default: '18:00' })
  openTo: string;
}

export const ArtisanProfileSchema = SchemaFactory.createForClass(ArtisanProfile);
ArtisanProfileSchema.index({ location: '2dsphere' });