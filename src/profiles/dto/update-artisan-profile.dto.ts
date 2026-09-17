import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsObject,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class SocialMediaDto {
  @IsString()
  @IsOptional()
  instagram?: string;

  @IsString()
  @IsOptional()
  facebook?: string;

  @IsString()
  @IsOptional()
  tiktok?: string;
}

class CustomOfferingDto {
  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['pending', 'approved'])
  status?: string;
}

export class UpdateArtisanProfileDto {
  @IsArray()
  @IsOptional()
  skills?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  yearsExperience?: number;

  @IsArray()
  @ArrayMaxSize(12)
  @IsOptional()
  portfolioPhotos?: string[];

  @IsString()
  @IsOptional()
  bio?: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsObject()
  @ValidateNested()
  @Type(() => SocialMediaDto)
  @IsOptional()
  socialMedia?: SocialMediaDto;

  /* ---- identity ---- */

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  area?: string;

  /* ---- what they offer ---- */

  @IsString()
  @IsOptional()
  @IsIn(['services', 'products', 'both'])
  offerType?: string;

  @IsArray()
  @IsOptional()
  serviceIds?: string[];

  @IsArray()
  @IsOptional()
  productIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomOfferingDto)
  @IsOptional()
  customOfferings?: CustomOfferingDto[];

  /* ---- hours ---- */

  @IsArray()
  @IsOptional()
  workingDays?: string[];

  @IsString()
  @IsOptional()
  openFrom?: string;

  @IsString()
  @IsOptional()
  openTo?: string;
}