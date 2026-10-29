import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AllowSetup, AuthRequest, Public } from './auth.decorators';
import {
  EmailDto,
  DeliveryDto,
  LoginDto,
  MessageDto,
  MfaSetupDto,
  RegisterDto,
  ResetDto,
  SessionDto,
  TokenDto,
  TotpDto,
  GenerateRecoveryCodesDto,
  RecoveryCodesDto,
} from './auth.dto';
import { privileged } from './auth.guard';
import { accountDelivery } from './auth.delivery';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Get('delivery')
  @ApiOkResponse({ type: DeliveryDto })
  delivery() {
    return accountDelivery();
  }
  @Public() @Post('register') @ApiCreatedResponse({ type: MessageDto }) register(
    @Body() body: RegisterDto,
  ) {
    return this.auth.register(body);
  }
  @Public()
  @Post('login')
  @ApiCreatedResponse({ type: SessionDto })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { rawToken, expiresAt, ...result } = await this.auth.login(body);
    res.cookie(
      process.env.NODE_ENV === 'production' ? '__Host-pathway_session' : 'pathway_session',
      rawToken,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
        path: '/',
        expires: expiresAt,
      },
    );
    res.setHeader('Cache-Control', 'no-store');
    return result;
  }
  @Post('mfa/recovery-codes')
  @ApiCookieAuth()
  @ApiCreatedResponse({ type: RecoveryCodesDto })
  recoveryCodes(@Req() req: AuthRequest, @Body() body: GenerateRecoveryCodesDto) {
    return this.auth.generateRecoveryCodes(req.user, req.sessionId, req.mfaVerified, body.password);
  }
  @AllowSetup()
  @ApiCookieAuth()
  @Get('session')
  @ApiOkResponse({ type: SessionDto })
  session(@Req() req: AuthRequest) {
    return {
      user: req.user,
      csrfToken: req.csrfToken,
      mfaRequired: (privileged(req.user.roles) || req.user.mfaEnabled) && !req.mfaVerified,
    };
  }
  @AllowSetup()
  @Post('logout')
  @ApiCreatedResponse({ type: MessageDto })
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.revoke(req.user.id, req.sessionId);
    res.clearCookie(
      process.env.NODE_ENV === 'production' ? '__Host-pathway_session' : 'pathway_session',
      {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
      },
    );
    return result;
  }
  @AllowSetup() @Post('revoke-sessions') @ApiCreatedResponse({ type: MessageDto }) revokeAll(
    @Req() req: AuthRequest,
  ) {
    return this.auth.revoke(req.user.id);
  }
  @Public() @Post('verify') @ApiCreatedResponse({ type: MessageDto }) verify(
    @Body() body: TokenDto,
  ) {
    return this.auth.verify(body.token);
  }
  @Public() @Post('recover') @ApiCreatedResponse({ type: MessageDto }) recover(
    @Body() body: EmailDto,
  ) {
    return this.auth.recover(body.email);
  }
  @Public() @Post('reset') @ApiCreatedResponse({ type: MessageDto }) reset(@Body() body: ResetDto) {
    return this.auth.reset(body);
  }
  @AllowSetup() @Post('verification') @ApiCreatedResponse({ type: MessageDto }) resend(
    @Req() req: AuthRequest,
  ) {
    return this.auth.resendVerification(req.user);
  }
  @AllowSetup() @Post('mfa/setup') @ApiCreatedResponse({ type: MfaSetupDto }) setup(
    @Req() req: AuthRequest,
  ) {
    return this.auth.setupMfa(req.user);
  }
  @AllowSetup() @Post('mfa/enable') @ApiCreatedResponse({ type: MessageDto }) enable(
    @Req() req: AuthRequest,
    @Body() body: TotpDto,
  ) {
    return this.auth.enableMfa(req.user, req.sessionId, body.code);
  }
}
