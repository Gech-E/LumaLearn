import { Controller, Get, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthRequest } from '../auth/auth.decorators';
import { MediaService } from './media.service';
import { MAX_FILE_BYTES } from './storage';
import { AssetDto, DownloadDto } from './media.dto';
@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Post('upload')
  @ApiCreatedResponse({ type: AssetDto })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } }),
  )
  upload(@Req() req: AuthRequest, @UploadedFile() file?: Express.Multer.File) {
    return this.media.upload(req.user, file);
  }
  @Get(':id') @ApiOkResponse({ type: AssetDto }) status(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.media.status(req.user, id);
  }
  @Get(':id/download') @ApiOkResponse({ type: DownloadDto }) download(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.media.download(req.user, id);
  }
}
