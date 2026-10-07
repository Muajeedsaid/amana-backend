import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.userModel.findOne({ phone: dto.phone });
    if (existingUser) {
      throw new ConflictException('A user with this phone number already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const newUser = new this.userModel({
      phone: dto.phone,
      passwordHash,
      role: dto.role,
    });

    const savedUser = await newUser.save();

    return this.issueToken(savedUser);
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ phone: dto.phone });
    if (!user) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    return this.issueToken(user);
  }

  private async issueToken(user: UserDocument) {
    const payload = { sub: user._id, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user._id,
        phone: user.phone,
        role: user.role,
      },
    };
  }
}