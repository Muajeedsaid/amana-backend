import { IsString, IsNotEmpty, MinLength, IsIn } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsIn(['customer', 'artisan', 'apprentice'])
  role: string;
}