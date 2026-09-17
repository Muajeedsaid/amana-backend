import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// NOTE: cloudinary.config() is deliberately NOT called here at module
// scope. Nest imports this file (and therefore runs any top-level code)
// while it is still building the dependency graph, which can happen
// before .env has finished loading into process.env — so cloud_name /
// api_key / api_secret end up undefined even though they're correct in
// .env. Configuring inside the request handler guarantees env vars are
// already loaded by the time we need them.

@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor() {
    // Fail loudly at startup instead of on the first upload attempt.
    const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
      .filter((key) => !process.env[key]);

    if (missing.length) {
      this.logger.error(
        `Cloudinary is not configured. Missing env vars: ${missing.join(', ')}`,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, callback) => {
        const allowedTypes = /jpeg|jpg|png|webp|heic|heif/;
        const isValid = allowedTypes.test(extname(file.originalname).toLowerCase());
        if (!isValid) {
          return callback(
            new BadRequestException('Only image files (jpg, png, webp, heic) are allowed'),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    try {
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'amana' },
          (error, result) => {
            if (error || !result) {
              return reject(error);
            }
            resolve(result);
          },
        );

        uploadStream.end(file.buffer);
      });

      return { url: result.secure_url };
    } catch (error: any) {
      // This is the line that would have told us what was actually wrong.
      this.logger.error('Cloudinary upload failed', error?.stack || error);

      throw new InternalServerErrorException(
        error?.message || 'Could not upload the photo. Please try again.',
      );
    }
  }
}